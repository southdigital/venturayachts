import { getStore } from "@netlify/blobs";

/* ============================================================================
 * Configuration defaults
 * ========================================================================== */

const DEFAULT_TTL_SECONDS = 30 * 60;
const DEFAULT_PER_PAGE = 10;
const DEFAULT_FETCH_TIMEOUT_MS = 8000;
const DEFAULT_REFRESH_BACKOFF_SECONDS = 120;
const DEFAULT_BLOB_STORE_NAME = "yachts-cache";
const DEFAULT_BLOB_KEY = "cya-base-dataset";
const BLOB_SCHEMA_VERSION = 1;

const DEFAULT_CURRCONV_KEY = "32e0eac2807f4ce3ac976f8233ed2f06";

const SUPPORTED_CURRENCIES = ["GBP", "EUR", "USD"];
const DEFAULT_LANGUAGE = "en";
const CORS_ALLOW_ORIGIN = "*";
const CORS_ALLOW_METHODS = "GET,POST,OPTIONS";
const CORS_ALLOW_HEADERS = "Content-Type, Authorization";
const CORS_MAX_AGE = "86400";
const DEFAULT_CORS_ERROR = "Origin not allowed";

let memoryCache = null;
let blobStore = null;
let refreshBackoffUntil = 0;

/* ============================================================================
 * Env helpers
 * ========================================================================== */

function envInt(name, fallback) {
  const v = process.env[name];
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envString(name) {
  const v = process.env[name];
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}

function envFlag(name) {
  const v = envString(name);
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

/* ============================================================================
 * CORS (uses the SAME NETLIFY_ALLOWED_ORIGINS env var as the boats endpoint)
 * ========================================================================== */

function parseAllowedOrigins(raw) {
  if (!raw) return null;
  const parts = raw
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

function splitHostPort(value) {
  const trimmed = (value || "").trim().toLowerCase();
  if (!trimmed) return { host: "", port: "" };
  const lastColon = trimmed.lastIndexOf(":");
  if (lastColon > -1 && !trimmed.includes("]")) {
    const portPart = trimmed.slice(lastColon + 1);
    if (/^\d+$/.test(portPart)) {
      return { host: trimmed.slice(0, lastColon), port: portPart };
    }
  }
  return { host: trimmed, port: "" };
}

function defaultPort(protocol) {
  if (protocol === "https:") return "443";
  if (protocol === "http:") return "80";
  return "";
}

function parseOriginInfo(origin) {
  try {
    const url = new URL(origin);
    return {
      origin: url.origin.toLowerCase(),
      hostname: url.hostname.toLowerCase(),
      port: url.port || defaultPort(url.protocol),
      protocol: url.protocol,
    };
  } catch {
    return {
      origin: (origin || "").toLowerCase(),
      hostname: "",
      port: "",
      protocol: "",
    };
  }
}

function matchHostname(hostname, pattern) {
  if (!hostname || !pattern) return false;
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1);
    return hostname.endsWith(suffix) && hostname.length > suffix.length;
  }
  return hostname === pattern;
}

function normalizeOrigin(value) {
  if (!value) return "";
  const trimmed = value.trim();
  try {
    return new URL(trimmed).origin.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

const ALLOWED_ORIGINS = parseAllowedOrigins(envString("NETLIFY_ALLOWED_ORIGINS"));
const CORS_DEBUG = envFlag("NETLIFY_CORS_DEBUG") || envFlag("CORS_DEBUG");

function logCorsEvent(label, origin, allowed) {
  if (!CORS_DEBUG) return;
  const allowedLabel = ALLOWED_ORIGINS ? ALLOWED_ORIGINS.join(", ") : "*";
  console.log(`[cors] ${label}`, { origin: origin ?? null, allowed, allowedOrigins: allowedLabel });
}

function isOriginAllowed(origin) {
  if (!ALLOWED_ORIGINS) return true;
  if (!origin) return true;
  if (origin === "null") return false;
  const incoming = parseOriginInfo(origin);
  return ALLOWED_ORIGINS.some((allowed) => {
    if (!allowed) return false;
    if (allowed.includes("://")) {
      return normalizeOrigin(allowed) === incoming.origin;
    }
    const { host, port } = splitHostPort(allowed);
    if (!matchHostname(incoming.hostname, host)) return false;
    if (port && port !== incoming.port) return false;
    return true;
  });
}

function resolveCorsAllowOrigin(origin) {
  if (!ALLOWED_ORIGINS) return CORS_ALLOW_ORIGIN;
  if (!origin) return null;
  return isOriginAllowed(origin) ? origin : null;
}

function corsHeaders(req = null) {
  const origin = req?.headers?.get("origin") ?? null;
  const allowOrigin = resolveCorsAllowOrigin(origin);
  const headers = {
    "access-control-allow-methods": CORS_ALLOW_METHODS,
    "access-control-allow-headers": CORS_ALLOW_HEADERS,
    "access-control-max-age": CORS_MAX_AGE,
  };
  if (allowOrigin) {
    headers["access-control-allow-origin"] = allowOrigin;
  }
  if (ALLOWED_ORIGINS) {
    headers.vary = "Origin";
  }
  return headers;
}

function corsPreflightResponse(req = null) {
  const origin = req?.headers?.get("origin") ?? null;
  const allowed = isOriginAllowed(origin);
  logCorsEvent("preflight", origin, allowed);
  if (origin && !allowed) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req),
  });
}

function corsGuardResponse(req = null) {
  const origin = req?.headers?.get("origin") ?? null;
  const allowed = isOriginAllowed(origin);
  logCorsEvent("request", origin, allowed);
  if (!origin) return null;
  if (allowed) return null;
  return new Response(JSON.stringify({ error: DEFAULT_CORS_ERROR }), {
    status: 403,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function jsonResponse(payload, status = 200, extraHeaders = {}, req = null) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(req),
      ...extraHeaders,
    },
  });
}

/* ============================================================================
 * Config
 * ========================================================================== */

function getConfig() {
  return {
    ttlSeconds: envInt("YACHTS_CACHE_TTL_SECONDS", DEFAULT_TTL_SECONDS),
    perPage: envInt("YACHTS_PER_PAGE", DEFAULT_PER_PAGE),
    fetchTimeoutMs: envInt("YACHTS_FETCH_TIMEOUT_MS", DEFAULT_FETCH_TIMEOUT_MS),
    refreshBackoffSeconds: envInt("YACHTS_REFRESH_BACKOFF_SECONDS", DEFAULT_REFRESH_BACKOFF_SECONDS),
    cyaUser: envString("CYA_USER_ID"),
    cyaApiCode: envString("CYA_API_CODE"),
    currconvKey: envString("CURRCONV_API_KEY") || DEFAULT_CURRCONV_KEY,
    blobStoreName: envString("YACHTS_BLOB_STORE") || DEFAULT_BLOB_STORE_NAME,
    blobKey: envString("YACHTS_BLOB_KEY") || DEFAULT_BLOB_KEY,
  };
}

/* ============================================================================
 * Formatting + conversion helpers
 * ========================================================================== */

function decodeHtmlEntities(value) {
  if (value == null) return "";
  return value
    .toString()
    .replace(/&#8364;/g, "€")
    .replace(/&euro;/g, "€")
    .replace(/&pound;/g, "£")
    .replace(/&#36;/g, "$")
    .replace(/&dollar;/g, "$")
    .replace(/&amp;/g, "&");
}

function formatNumber(num) {
  const n = Number(num);
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function currencySymbol(curr) {
  switch (curr) {
    case "GBP":
      return "£";
    case "EUR":
      return "€";
    case "USD":
      return "$";
    default:
      return "";
  }
}

function currencyConverter(price, curr, currConvert, convertTo) {
  if (curr === convertTo) {
    return formatNumber(price);
  }
  if (!curr) {
    return formatNumber(price);
  }
  if (!SUPPORTED_CURRENCIES.includes(curr)) {
    return formatNumber(price);
  }
  const rate = currConvert ? Number(currConvert[`${curr}_${convertTo}`]) : NaN;
  if (!Number.isFinite(rate)) {
    return formatNumber(price);
  }
  return formatNumber(Number(price) * rate);
}

function currencyPriceLabel(num, curr) {
  const symbol = currencySymbol(curr);
  return `${symbol}${formatNumber(num)}`;
}

function measurementConverter(length, from) {
  const n = Number(length);
  if (!Number.isFinite(n)) return "";
  if (from === "Metres") {
    return Math.round(n * 3.28084);
  }
  return Math.round(n * 0.3048000097536);
}

function cabinsLabel(num, lang = DEFAULT_LANGUAGE) {
  const n = Number(num);
  if (!Number.isFinite(n) || n === 0) return "";
  if (n === 1) return lang === "en" ? "1 Cabin" : "1 Cabina";
  return lang === "en" ? `${n} Cabins` : `${n} Camarotes`;
}

function passengersLabel(num, lang = DEFAULT_LANGUAGE) {
  const n = Number(num);
  if (!Number.isFinite(n) || n === 0) return "";
  if (n === 1) return lang === "en" ? "1 Passenger" : "1 Pasajero";
  return lang === "en" ? `${n} Passengers` : `${n} Pasajeros`;
}

function stripApostrophes(value) {
  if (value == null) return "";
  return value.toString().replace(/\\/g, "").replace(/'/g, "");
}

function parseFormattedNumber(value) {
  if (value == null || value === "") return 0;
  const n = Number.parseFloat(value.toString().replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parsePriceFilterValue(rawValue) {
  if (rawValue == null) return null;
  const raw = stripApostrophes(rawValue).toString().trim();
  if (raw === "") return null;

  const hasMillionHint = /m/i.test(raw);
  const cleaned = raw.replace(/[^0-9.,]/g, "");
  if (!/\d/.test(cleaned)) return null;

  const numeric = parseFormattedNumber(cleaned.replace(/m/gi, ""));
  if (!Number.isFinite(numeric)) return null;

  if (hasMillionHint) {
    return numeric * 1_000_000;
  }

  // Legacy UI convention: small numbers are in millions
  if (numeric > 0 && numeric < 1000) {
    return numeric * 1_000_000;
  }

  return numeric;
}

function toNumberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/* ============================================================================
 * Currency rates
 * ========================================================================== */

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function fetchJson(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const res = await fetchWithTimeout(url, options, timeoutMs);
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.json();
}

async function getCurrConvert(cfg) {
  const timeoutMs = Math.min(cfg.fetchTimeoutMs || DEFAULT_FETCH_TIMEOUT_MS, 6000);
  if (!cfg.currconvKey) return null;

  try {
    const queries = ["EUR_GBP,GBP_EUR", "USD_GBP,GBP_USD", "USD_EUR,EUR_USD"];
    const requests = queries.map((q) => {
      const url = `https://api.currconv.com/api/v7/convert?q=${q}&compact=y&apiKey=${encodeURIComponent(
        cfg.currconvKey
      )}`;
      return fetchJson(url, {}, timeoutMs);
    });

    const results = await Promise.allSettled(requests);
    const map = {};
    for (const res of results) {
      if (res.status !== "fulfilled") continue;
      const data = res.value || {};
      for (const [key, value] of Object.entries(data)) {
        if (!key.includes("_")) continue;
        if (typeof value === "number") {
          map[key] = value;
        } else if (value && typeof value === "object" && "val" in value) {
          map[key] = Number(value.val);
        }
      }
    }
    return Object.keys(map).length ? map : null;
  } catch {
    return null;
  }
}

/* ============================================================================
 * CYA feed normalisation
 * ========================================================================== */

function parseCyaPrice(rawPrice) {
  if (rawPrice == null) return 0;
  const decoded = decodeHtmlEntities(rawPrice);
  const cleaned = decoded.replace(/[^0-9.]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function resolveCyaCurrency(item) {
  const raw = (item?.yachtCurrency || "").toString().trim().toUpperCase();
  if (SUPPORTED_CURRENCIES.includes(raw)) return raw;

  // Fallback: sniff the symbol from the price string
  const symbol = decodeHtmlEntities(item?.yachtLowPrice || item?.yachtHighPrice || "");
  if (symbol.includes("€")) return "EUR";
  if (symbol.includes("£")) return "GBP";
  if (symbol.includes("$")) return "USD";
  return "";
}

function parseMetreFromSize(sizeMeter, size) {
  const raw = (sizeMeter || size || "").toString();
  const match = raw.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return "";
  const n = Number.parseFloat(match[1]);
  return Number.isFinite(n) ? n : "";
}

function parseFeetFromSize(sizeFeet) {
  const raw = (sizeFeet || "").toString();
  const match = raw.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return "";
  const n = Number.parseFloat(match[1]);
  return Number.isFinite(n) ? n : "";
}

function normalizeCya(item, currConvert) {
  const idRaw = item?.yachtId ?? null;
  if (idRaw == null) return null;

  const lowPrice = parseCyaPrice(item?.yachtLowNumericPrice ?? item?.yachtLowPrice);
  const highPrice = parseCyaPrice(item?.yachtHighNumericPrice ?? item?.yachtHighPrice);
  const price = lowPrice || highPrice || 0;

  const curr = resolveCyaCurrency(item);

  const price_gbp = currencyConverter(price, curr, currConvert, "GBP");
  const price_eur = currencyConverter(price, curr, currConvert, "EUR");
  const price_usd = currencyConverter(price, curr, currConvert, "USD");

  const low_gbp = currencyConverter(lowPrice, curr, currConvert, "GBP");
  const low_eur = currencyConverter(lowPrice, curr, currConvert, "EUR");
  const low_usd = currencyConverter(lowPrice, curr, currConvert, "USD");
  const high_gbp = currencyConverter(highPrice, curr, currConvert, "GBP");
  const high_eur = currencyConverter(highPrice, curr, currConvert, "EUR");
  const high_usd = currencyConverter(highPrice, curr, currConvert, "USD");

  let length_metre = parseMetreFromSize(item?.sizeMeter, item?.size);
  let length_feet = parseFeetFromSize(item?.sizeFeet);
  if (length_metre !== "" && length_feet === "") {
    length_feet = measurementConverter(length_metre, "Metres");
  } else if (length_feet !== "" && length_metre === "") {
    length_metre = measurementConverter(length_feet, "Feet");
  }

  const cabinsNum = item?.yachtCabins != null && item.yachtCabins !== "" ? Number(item.yachtCabins) : "";
  const passengersNum = item?.yachtPax != null && item.yachtPax !== "" ? Number(item.yachtPax) : "";
  const crewNum = item?.yachtCrew != null && item.yachtCrew !== "" ? Number(item.yachtCrew) : "";

  const main_image = item?.yachtEbrochurePic || "";

  // Keep the raw (but decoded) price labels from the feed when useful,
  // and also produce a normalized "price_title" derived from the low price.
  const price_title = currencyPriceLabel(price, curr);

  return {
    boat_id: idRaw.toString(),
    yacht_id: idRaw.toString(),
    yachtworld_id: "",
    name: item?.yachtName ?? "",
    make: item?.yachtBuilder ?? "",
    model: "",
    year: item?.yachtYearBuilt ?? "",
    type: item?.yachtType ?? "",

    price,
    price_low: lowPrice,
    price_high: highPrice,
    price_gbp,
    price_eur,
    price_usd,
    price_low_gbp: low_gbp,
    price_low_eur: low_eur,
    price_low_usd: low_usd,
    price_high_gbp: high_gbp,
    price_high_eur: high_eur,
    price_high_usd: high_usd,
    price_title,
    price_currency: curr,

    length_metre,
    length_feet,

    number_of_cabins_num: Number.isFinite(cabinsNum) ? cabinsNum : "",
    number_of_cabins: cabinsLabel(cabinsNum),
    number_of_passengers_num: Number.isFinite(passengersNum) ? passengersNum : "",
    number_of_passengers: passengersNum !== "" ? passengersLabel(passengersNum) : "",
    crew: Number.isFinite(crewNum) ? crewNum : "",

    winter_areas: item?.YachtWinterAreas ?? "",
    summer_areas: item?.YachtSummerAreas ?? "",

    broker_web: item?.yachtBrokerWeb ?? "",
    video: item?.yachtVideo ?? "",
    specs: item?.yachtSpecs ?? "",
    rates: item?.yachtRates ?? "",

    main_image,
    image: main_image ? [main_image] : [],
    videos: [],
    feed: "cya",
  };
}

/* ============================================================================
 * Fetch + build base dataset
 * ========================================================================== */

async function fetchAndBuildBaseDataset() {
  const cfg = getConfig();

  if (!cfg.cyaUser) throw new Error("Missing env var CYA_USER_ID");
  if (!cfg.cyaApiCode) throw new Error("Missing env var CYA_API_CODE");

  const cyaUrl =
    "https://www.centralyachtagent.com/snapins/json-snyachts.php" +
    `?user=${encodeURIComponent(cfg.cyaUser)}` +
    "&ylocations[]=&ylocations[]" +
    `&apicode=${encodeURIComponent(cfg.cyaApiCode)}`;

  const source_status = {
    cya: { ok: true, error: null },
  };

  const [currResult, cyaResult] = await Promise.allSettled([
    getCurrConvert(cfg),
    fetchJson(cyaUrl, {}, cfg.fetchTimeoutMs),
  ]);

  const currConvert =
    currResult.status === "fulfilled" && currResult.value ? currResult.value : {};

  let cyaItems = [];
  if (cyaResult.status === "fulfilled") {
    const payload = cyaResult.value;
    cyaItems = Array.isArray(payload?.yacht)
      ? payload.yacht
      : Array.isArray(payload)
      ? payload
      : [];
  } else {
    source_status.cya = {
      ok: false,
      error: cyaResult.reason?.message || "cya failed",
    };
  }

  const merged = cyaItems
    .map((item) => normalizeCya(item, currConvert))
    .filter(Boolean);

  merged.sort((a, b) => toNumberOrZero(a.price) - toNumberOrZero(b.price));

  if (!source_status.cya.ok) {
    const err = new Error("CYA feed failed");
    err.source_status = source_status;
    throw err;
  }

  return {
    last_updated: new Date().toISOString(),
    stale: false,
    source_status,
    data: merged,
  };
}

/* ============================================================================
 * Blob-backed caching
 * ========================================================================== */

function getBlobStore(cfg) {
  if (blobStore) return blobStore;
  blobStore = getStore(cfg.blobStoreName);
  return blobStore;
}

function serializeBlobPayload(payload) {
  return JSON.stringify({
    v: BLOB_SCHEMA_VERSION,
    stored_at: new Date().toISOString(),
    payload,
  });
}

function parseBlobPayload(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== BLOB_SCHEMA_VERSION) return null;
    if (!parsed.payload || !Array.isArray(parsed.payload.data)) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

function buildCacheMeta(base, reason, extra = {}) {
  return {
    hit: true,
    reason,
    source: extra.source || "unknown",
    error: extra.error || null,
    updated_at: base?.last_updated ?? null,
    served_at: new Date().toISOString(),
  };
}

function applyFallbackMeta(base, reason, extra = {}) {
  if (!base) return null;
  return {
    ...base,
    stale: true,
    source_status: {
      ...(base?.source_status || {}),
      cache: {
        ok: true,
        fallback: true,
        reason,
        source: extra.source || "unknown",
        error: extra.error || null,
      },
    },
    cache: buildCacheMeta(base, reason, extra),
  };
}

async function readBlobDataset(cfg, { consistency = "strong" } = {}) {
  try {
    const store = getBlobStore(cfg);
    const raw = await store.get(cfg.blobKey, { consistency });
    return parseBlobPayload(raw);
  } catch (e) {
    console.log("[yachts] blob read failed", e?.message || e);
    return null;
  }
}

async function writeBlobDataset(cfg, payload) {
  try {
    const store = getBlobStore(cfg);
    const body = serializeBlobPayload(payload);
    await store.set(cfg.blobKey, body, {
      metadata: {
        schema: String(BLOB_SCHEMA_VERSION),
        stored_at: payload?.last_updated || new Date().toISOString(),
      },
    });
  } catch (e) {
    console.log("[yachts] blob write failed", e?.message || e);
  }
}

function isExpired(cached, ttlSeconds) {
  if (!cached?.last_updated) return true;
  const ts = Date.parse(cached.last_updated);
  if (!Number.isFinite(ts)) return true;
  return (Date.now() - ts) / 1000 > ttlSeconds;
}

async function getCachedBaseDataset({ forceRefresh = false } = {}) {
  const cfg = getConfig();
  const cachedData = memoryCache;
  const expired = cachedData ? isExpired(cachedData, cfg.ttlSeconds) : true;
  const now = Date.now();

  if (!forceRefresh && cachedData && !expired) {
    return cachedData;
  }

  // Hydrate from blob if memory is empty and the blob is fresh
  if (!forceRefresh && !cachedData) {
    const blob = await readBlobDataset(cfg, { consistency: "strong" });
    if (blob && !isExpired(blob, cfg.ttlSeconds)) {
      memoryCache = blob;
      return blob;
    }
    if (blob && now < refreshBackoffUntil) {
      const blobFallback = applyFallbackMeta(blob, "refresh_backoff", { source: "blob" });
      if (blobFallback) {
        memoryCache = blobFallback;
        return blobFallback;
      }
    }
  }

  if (!forceRefresh && cachedData && now < refreshBackoffUntil) {
    const fallback = applyFallbackMeta(cachedData, "refresh_backoff", { source: "memory" });
    if (fallback) {
      memoryCache = fallback;
      return fallback;
    }
  }

  try {
    const built = await fetchAndBuildBaseDataset();
    memoryCache = built;
    refreshBackoffUntil = 0;
    await writeBlobDataset(cfg, built);
    return built;
  } catch (e) {
    refreshBackoffUntil = Date.now() + cfg.refreshBackoffSeconds * 1000;
    const errorMessage = e?.message || "refresh failed";
    const memFallback = applyFallbackMeta(cachedData, "fetch_failed", {
      source: "memory",
      error: errorMessage,
    });
    if (memFallback) {
      memoryCache = memFallback;
      return memFallback;
    }
    const blob = await readBlobDataset(cfg, { consistency: "strong" });
    const blobFallback = applyFallbackMeta(blob, "fetch_failed", {
      source: "blob",
      error: errorMessage,
    });
    if (blobFallback) {
      memoryCache = blobFallback;
      return blobFallback;
    }
    throw e;
  }
}

/* ============================================================================
 * Query filtering + pagination
 * ========================================================================== */

function applyQueryFiltering(base, url) {
  const cfg = getConfig();
  const params = url.searchParams;

  const currencyRaw = stripApostrophes(params.get("currencyVal") || "").trim();
  const currencyVal = currencyRaw ? currencyRaw.toUpperCase() : "EUR";
  const measurementVal = stripApostrophes(params.get("measurementVal") || "").trim() || "Metres";
  const sortby = stripApostrophes(params.get("sortby") || "").trim() || "low";
  const pagenumParam = params.get("pagenum") || params.get("page") || "1";
  const pagenum = Math.max(1, Number.parseInt(pagenumParam, 10) || 1);

  const priceCol =
    currencyVal === "GBP"
      ? "price_gbp"
      : currencyVal === "USD"
      ? "price_usd"
      : "price_eur";

  const measurementCol = measurementVal === "Feet" ? "length_feet" : "length_metre";

  let rows = Array.isArray(base?.data) ? base.data.slice() : [];

  // Brand / builder
  const brands = stripApostrophes(params.get("brands") || params.get("brand") || "");
  if (brands !== "") {
    const needle = brands.toLowerCase();
    rows = rows.filter((b) => (b.make ?? "").toString().toLowerCase() === needle);
  }

  // Yacht type (Power / Sail / Motor Sailer, etc)
  const yachtType = stripApostrophes(params.get("type") || params.get("yachtType") || "");
  if (yachtType !== "") {
    const needle = yachtType.toLowerCase();
    rows = rows.filter((b) => (b.type ?? "").toString().toLowerCase() === needle);
  }

  // Price range (compares against the active currency column)
  const pricefromVal = parsePriceFilterValue(params.get("pricefrom"));
  if (pricefromVal != null) {
    rows = rows.filter((b) => parseFormattedNumber(b[priceCol]) >= pricefromVal);
  }
  const pricetoVal = parsePriceFilterValue(params.get("priceto"));
  if (pricetoVal != null) {
    rows = rows.filter((b) => parseFormattedNumber(b[priceCol]) < pricetoVal);
  }

  // Length
  const lengthfrom = stripApostrophes(params.get("lengthfrom") || "");
  if (lengthfrom !== "") {
    const lenVal = Number(lengthfrom);
    if (Number.isFinite(lenVal)) {
      rows = rows.filter((b) => Number(b[measurementCol] ?? 0) >= lenVal);
    }
  }
  const lengthto = stripApostrophes(params.get("lengthto") || "");
  if (lengthto !== "") {
    const lenVal = Number(lengthto);
    if (Number.isFinite(lenVal)) {
      rows = rows.filter((b) => Number(b[measurementCol] ?? 0) <= lenVal);
    }
  }

  // Year built
  const yearfrom = stripApostrophes(params.get("yearfrom") || "");
  if (yearfrom !== "") {
    const yearVal = Number(yearfrom);
    if (Number.isFinite(yearVal)) {
      rows = rows.filter((b) => Number(b.year ?? 0) >= yearVal);
    }
  }
  const yearto = stripApostrophes(params.get("yearto") || "");
  if (yearto !== "") {
    const yearVal = Number(yearto);
    if (Number.isFinite(yearVal)) {
      rows = rows.filter((b) => Number(b.year ?? 0) <= yearVal);
    }
  }

  // Cabins
  const mincabins = stripApostrophes(params.get("mincabins") || "");
  if (mincabins !== "") {
    const cabinsVal = Number(mincabins);
    if (Number.isFinite(cabinsVal)) {
      rows = rows.filter((b) => Number(b.number_of_cabins_num ?? 0) >= cabinsVal);
    }
  }
  const maxcabins = stripApostrophes(params.get("maxcabins") || "");
  if (maxcabins !== "") {
    const cabinsVal = Number(maxcabins);
    if (Number.isFinite(cabinsVal)) {
      rows = rows.filter((b) => Number(b.number_of_cabins_num ?? 0) <= cabinsVal);
    }
  }

  // Passengers
  const minpax = stripApostrophes(params.get("minpax") || params.get("minpassengers") || "");
  if (minpax !== "") {
    const paxVal = Number(minpax);
    if (Number.isFinite(paxVal)) {
      rows = rows.filter((b) => Number(b.number_of_passengers_num ?? 0) >= paxVal);
    }
  }

  // Region filter (winter / summer cruising areas)
  const region = stripApostrophes(params.get("region") || params.get("area") || "").toLowerCase();
  if (region !== "") {
    rows = rows.filter((b) => {
      const haystack = `${b.winter_areas ?? ""} ${b.summer_areas ?? ""}`.toLowerCase();
      return haystack.includes(region);
    });
  }

  // Keyword search across name + make + model + type
  const keywordsearch = stripApostrophes(params.get("keywordsearch") || params.get("query") || "").trim();
  if (keywordsearch !== "") {
    const searchWords = keywordsearch.toLowerCase().split(/\s+/).filter(Boolean);
    rows = rows.filter((b) => {
      const haystack = stripApostrophes(
        `${b.name ?? ""} ${b.make ?? ""} ${b.model ?? ""} ${b.type ?? ""}`.toLowerCase()
      );
      const findWords = haystack.split(/\s+/).filter(Boolean);
      return searchWords.every((word) => findWords.some((fw) => fw.includes(word)));
    });
  }

  // Sorting
  if (sortby === "high") {
    rows.sort((a, b) => toNumberOrZero(b.price) - toNumberOrZero(a.price));
  } else if (sortby === "lengthshort") {
    rows.sort((a, b) => toNumberOrZero(a.length_metre) - toNumberOrZero(b.length_metre));
  } else if (sortby === "lengthlong") {
    rows.sort((a, b) => toNumberOrZero(b.length_metre) - toNumberOrZero(a.length_metre));
  } else if (sortby === "yearnew") {
    rows.sort((a, b) => toNumberOrZero(b.year) - toNumberOrZero(a.year));
  } else if (sortby === "yearold") {
    rows.sort((a, b) => toNumberOrZero(a.year) - toNumberOrZero(b.year));
  } else {
    rows.sort((a, b) => toNumberOrZero(a.price) - toNumberOrZero(b.price));
  }

  const total = rows.length;
  const perPage = cfg.perPage;
  const lastpage = Math.max(1, Math.ceil(total / perPage));
  const nextpage = pagenum < lastpage ? pagenum + 1 : lastpage;
  const prevpage = pagenum > 1 ? pagenum - 1 : 1;

  const start = (pagenum - 1) * perPage;
  const end = start + perPage;
  const paged = rows.slice(start, end);

  return {
    meta: {
      pagenum,
      per_page: perPage,
      total,
      lastpage,
      nextpage,
      prevpage,
      sortby,
      currencyVal,
      measurementVal,
      last_updated: base?.last_updated ?? null,
      stale: base?.stale ?? false,
      source_status: base?.source_status ?? null,
    },
    data: paged,
  };
}

/* ============================================================================
 * Handler
 * ========================================================================== */

export default async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return corsPreflightResponse(req);
    }

    const corsGuard = corsGuardResponse(req);
    if (corsGuard) {
      return corsGuard;
    }

    const url = new URL(req.url);

    // Admin/debug: force-refresh the cache
    const forceRefresh = ["1", "true", "yes"].includes(
      (url.searchParams.get("refresh") || "").toLowerCase()
    );

    // Detail lookup by id
    const id =
      url.searchParams.get("id") ||
      url.searchParams.get("yacht_id") ||
      url.searchParams.get("yachtid") ||
      url.searchParams.get("boat_id");

    const base = await getCachedBaseDataset({ forceRefresh });

    if (id) {
      const targetId = id.toString().trim().replace(/\/+$/, "");
      const normalizedId = targetId.includes(":") ? targetId.split(":").pop() : targetId;

      const found = (base.data || []).find(
        (b) =>
          (b?.boat_id != null && b.boat_id.toString() === normalizedId) ||
          (b?.yacht_id != null && b.yacht_id.toString() === normalizedId)
      );

      if (!found) {
        return jsonResponse({ error: "Not found", id: normalizedId }, 404, {}, req);
      }

      return jsonResponse(
        {
          meta: {
            last_updated: base.last_updated,
            stale: base.stale,
            source_status: base.source_status,
          },
          data: found,
        },
        200,
        {},
        req
      );
    }

    const filtered = applyQueryFiltering(base, url);
    return jsonResponse(filtered, 200, {}, req);
  } catch (e) {
    return jsonResponse({ error: e?.message || "Unexpected error" }, 500, {}, req);
  }
};