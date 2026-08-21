import { getStore } from "@netlify/blobs";

/* ============================================================================
 * Configuration defaults
 * (kept in sync with the main yachts endpoint so this function can read the
 *  same blob cache without triggering a fresh upstream fetch)
 * ========================================================================== */

const DEFAULT_TTL_SECONDS = 30 * 60;
const DEFAULT_FETCH_TIMEOUT_MS = 8000;
const DEFAULT_REFRESH_BACKOFF_SECONDS = 120;
const DEFAULT_BLOB_STORE_NAME = "yachts-cache";
const DEFAULT_BLOB_KEY = "cya-base-dataset";
const BLOB_SCHEMA_VERSION = 1;

const DEFAULT_CURRCONV_KEY = "32e0eac2807f4ce3ac976f8233ed2f06";
const SUPPORTED_CURRENCIES = ["GBP", "EUR", "USD"];
const DEFAULT_LANGUAGE = "en";

const DEFAULT_RELATED_COUNT = 3;
const MAX_RELATED_COUNT = 12;

const CORS_ALLOW_ORIGIN = "*";
const CORS_ALLOW_METHODS = "GET,POST,OPTIONS";
const CORS_ALLOW_HEADERS = "Content-Type, Authorization";
const CORS_MAX_AGE = "86400";
const DEFAULT_CORS_ERROR = "Origin not allowed";

/* Scoring weights — tune these to shift what "related" means */
const SCORE_SAME_BUILDER = 100;
const SCORE_NAME_TOKEN_MATCH = 25; // per shared token in the name
const SCORE_SAME_TYPE = 40;
const SCORE_LENGTH_PROXIMITY_MAX = 30; // scaled by how close the length is
const SCORE_PRICE_PROXIMITY_MAX = 20; // scaled by how close the price is
const SCORE_SAME_CABINS = 10;
const LENGTH_TOLERANCE_METRES = 15; // beyond this, length score is 0
const PRICE_TOLERANCE_RATIO = 0.5; // ±50% price band

/* In-memory caches (per warm lambda) */
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
 * CORS (shares NETLIFY_ALLOWED_ORIGINS with the other endpoints)
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
 * Formatting + conversion helpers (copied from yachts endpoint so this
 * function can rebuild the dataset as a last-resort fallback if the blob
 * cache is cold)
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
  if (curr === convertTo) return formatNumber(price);
  if (!curr) return formatNumber(price);
  if (!SUPPORTED_CURRENCIES.includes(curr)) return formatNumber(price);
  const rate = currConvert ? Number(currConvert[`${curr}_${convertTo}`]) : NaN;
  if (!Number.isFinite(rate)) return formatNumber(price);
  return formatNumber(Number(price) * rate);
}

function currencyPriceLabel(num, curr) {
  const symbol = currencySymbol(curr);
  return `${symbol}${formatNumber(num)}`;
}

function measurementConverter(length, from) {
  const n = Number(length);
  if (!Number.isFinite(n)) return "";
  if (from === "Metres") return Math.round(n * 3.28084);
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

function toNumberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/* ============================================================================
 * Currency + upstream fetch (fallback path only)
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
 * Normalization (fallback-only path)
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

function buildPriceBundle(item, currConvert) {
  const low = parseCyaPrice(item?.yachtLowNumericPrice ?? item?.yachtLowPrice);
  const high = parseCyaPrice(item?.yachtHighNumericPrice ?? item?.yachtHighPrice);
  const price = low || high || 0;
  const curr = resolveCyaCurrency(item);

  return {
    price,
    price_low: low,
    price_high: high,
    price_currency: curr,
    price_title: currencyPriceLabel(price, curr),
    price_low_title: currencyPriceLabel(low, curr),
    price_high_title: currencyPriceLabel(high, curr),
    price_gbp: currencyConverter(price, curr, currConvert, "GBP"),
    price_eur: currencyConverter(price, curr, currConvert, "EUR"),
    price_usd: currencyConverter(price, curr, currConvert, "USD"),
    price_low_gbp: currencyConverter(low, curr, currConvert, "GBP"),
    price_low_eur: currencyConverter(low, curr, currConvert, "EUR"),
    price_low_usd: currencyConverter(low, curr, currConvert, "USD"),
    price_high_gbp: currencyConverter(high, curr, currConvert, "GBP"),
    price_high_eur: currencyConverter(high, curr, currConvert, "EUR"),
    price_high_usd: currencyConverter(high, curr, currConvert, "USD"),
  };
}

function normalizeCya(item, currConvert) {
  const idRaw = item?.yachtId ?? null;
  if (idRaw == null) return null;

  const pricing = buildPriceBundle(item, currConvert);

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
  const yachtName = (item?.yachtName ?? "").toString().trim();
  const yachtBuilder = (item?.yachtBuilder ?? "").toString().trim();

  return {
    boat_id: idRaw.toString(),
    yacht_id: idRaw.toString(),
    yachtworld_id: "",
    name: yachtName,
    title: yachtName,
    make: yachtBuilder,
    model: yachtName,
    builder: yachtBuilder,
    year: item?.yachtYearBuilt ?? "",
    type: item?.yachtType ?? "",

    ...pricing,

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

/* ----------------------------------------------------------------------------
 * CYA location filter
 *
 * As of ~16 July 2026 json-snyachts.php rejects a request that carries no real
 * search filter:
 *   400 {"detail":"At least one of boattype, ylocations, srcN, yachtname,
 *        clid, clin or single_boat is required."}
 * The old "&ylocations[]=&ylocations[]" sent two EMPTY values, which no longer
 * counts as supplying ylocations, so every refresh 400s. To get the whole fleet
 * we now pass every location code explicitly. Codes come from json-locations.php
 * so a location CYA adds later is picked up automatically; the static list is
 * only a fallback for when that call fails.
 * -------------------------------------------------------------------------- */

const CYA_LOCATIONS_URL = "https://www.centralyachtagent.com/snapins/json-locations.php";

const FALLBACK_LOCATION_CODES = Array.from({ length: 53 }, (_, i) => `src${i + 1}`);

async function getLocationCodes(cfg) {
  const url =
    CYA_LOCATIONS_URL +
    `?user=${encodeURIComponent(cfg.cyaUser)}` +
    `&apicode=${encodeURIComponent(cfg.cyaApiCode)}`;

  try {
    const payload = await fetchJson(url, {}, cfg.fetchTimeoutMs);
    const codes = (payload?.location ?? [])
      .map((entry) => entry?.yachtLocCode)
      .filter((code) => typeof code === "string" && code);
    if (codes.length) return codes;
    console.log("[yachts] cya locations returned no codes, using fallback list");
  } catch (e) {
    console.log("[yachts] cya locations fetch failed, using fallback list", e?.message || e);
  }
  return FALLBACK_LOCATION_CODES;
}

function buildLocationQuery(codes) {
  return codes.map((code) => `&ylocations[]=${encodeURIComponent(code)}`).join("");
}

async function fetchAndBuildBaseDataset() {
  const cfg = getConfig();

  if (!cfg.cyaUser) throw new Error("Missing env var CYA_USER_ID");
  if (!cfg.cyaApiCode) throw new Error("Missing env var CYA_API_CODE");

  const locationCodes = await getLocationCodes(cfg);

  const cyaUrl =
    "https://www.centralyachtagent.com/snapins/json-snyachts.php" +
    `?user=${encodeURIComponent(cfg.cyaUser)}` +
    buildLocationQuery(locationCodes) +
    `&apicode=${encodeURIComponent(cfg.cyaApiCode)}`;

  const source_status = { cya: { ok: true, error: null } };

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

  const merged = cyaItems.map((item) => normalizeCya(item, currConvert)).filter(Boolean);
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
 * Blob-backed dataset read (shared cache with /yachts endpoint)
 * ========================================================================== */

function getBlobStore(cfg) {
  if (blobStore) return blobStore;
  blobStore = getStore(cfg.blobStoreName);
  return blobStore;
}

function parseBlobPayload(raw, schemaVersion = BLOB_SCHEMA_VERSION, validate = null) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== schemaVersion) return null;
    if (!parsed.payload) return null;
    if (validate && !validate(parsed.payload)) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

function serializeBlobPayload(payload, schemaVersion = BLOB_SCHEMA_VERSION) {
  return JSON.stringify({
    v: schemaVersion,
    stored_at: new Date().toISOString(),
    payload,
  });
}

async function readBlobDataset(cfg, { consistency = "strong" } = {}) {
  try {
    const store = getBlobStore(cfg);
    const raw = await store.get(cfg.blobKey, { consistency });
    return parseBlobPayload(raw, BLOB_SCHEMA_VERSION, (p) => Array.isArray(p?.data));
  } catch (e) {
    console.log("[related-yachts] blob read failed", e?.message || e);
    return null;
  }
}

async function writeBlobDataset(cfg, payload) {
  try {
    const store = getBlobStore(cfg);
    const body = serializeBlobPayload(payload, BLOB_SCHEMA_VERSION);
    await store.set(cfg.blobKey, body, {
      metadata: {
        schema: String(BLOB_SCHEMA_VERSION),
        stored_at: payload?.last_updated || new Date().toISOString(),
      },
    });
  } catch (e) {
    console.log("[related-yachts] blob write failed", e?.message || e);
  }
}

function isExpired(cached, ttlSeconds) {
  if (!cached?.last_updated) return true;
  const ts = Date.parse(cached.last_updated);
  if (!Number.isFinite(ts)) return true;
  return (Date.now() - ts) / 1000 > ttlSeconds;
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
    cache: {
      hit: true,
      reason,
      source: extra.source || "unknown",
      error: extra.error || null,
      updated_at: base?.last_updated ?? null,
      served_at: new Date().toISOString(),
    },
  };
}

async function getCachedBaseDataset({ forceRefresh = false } = {}) {
  const cfg = getConfig();
  const cachedData = memoryCache;
  const expired = cachedData ? isExpired(cachedData, cfg.ttlSeconds) : true;
  const now = Date.now();

  if (!forceRefresh && cachedData && !expired) {
    return cachedData;
  }

  // Prefer blob cache — this is the whole point of sharing the same key as /yachts
  if (!forceRefresh && !cachedData) {
    const blob = await readBlobDataset(cfg, { consistency: "strong" });
    if (blob && !isExpired(blob, cfg.ttlSeconds)) {
      memoryCache = blob;
      return blob;
    }
    if (blob && now < refreshBackoffUntil) {
      const fallback = applyFallbackMeta(blob, "refresh_backoff", { source: "blob" });
      if (fallback) {
        memoryCache = fallback;
        return fallback;
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

  // Last resort — rebuild from upstream. In practice this should almost never
  // fire because /yachts keeps the blob warm.
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
 * Relatedness scoring
 * ========================================================================== */

const NAME_STOPWORDS = new Set([
  "the",
  "of",
  "and",
  "a",
  "an",
  "ii",
  "iii",
  "iv",
  "yacht",
  "m/y",
  "s/y",
  "my",
  "sy",
]);

function tokenize(value) {
  if (!value) return [];
  return value
    .toString()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !NAME_STOPWORDS.has(t));
}

function normalizeKey(value) {
  return (value || "").toString().trim().toLowerCase();
}

function proximityScore(a, b, tolerance, maxScore) {
  const av = Number(a);
  const bv = Number(b);
  if (!Number.isFinite(av) || !Number.isFinite(bv)) return 0;
  if (av <= 0 || bv <= 0) return 0;
  const diff = Math.abs(av - bv);
  if (diff >= tolerance) return 0;
  return maxScore * (1 - diff / tolerance);
}

function priceProximityScore(sourcePrice, candidatePrice) {
  const a = Number(sourcePrice);
  const b = Number(candidatePrice);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return 0;
  const ratio = Math.abs(a - b) / a;
  if (ratio >= PRICE_TOLERANCE_RATIO) return 0;
  return SCORE_PRICE_PROXIMITY_MAX * (1 - ratio / PRICE_TOLERANCE_RATIO);
}

function scoreCandidate(source, candidate, sourceNameTokens) {
  const reasons = [];
  let score = 0;

  const sourceBuilder = normalizeKey(source.builder || source.make);
  const candidateBuilder = normalizeKey(candidate.builder || candidate.make);
  if (sourceBuilder && candidateBuilder && sourceBuilder === candidateBuilder) {
    score += SCORE_SAME_BUILDER;
    reasons.push("same_builder");
  }

  if (sourceNameTokens.length) {
    const candidateTokens = new Set(tokenize(candidate.name));
    const shared = sourceNameTokens.filter((t) => candidateTokens.has(t));
    if (shared.length) {
      score += Math.min(shared.length, 3) * SCORE_NAME_TOKEN_MATCH;
      reasons.push("name_match");
    }
  }

  const sourceType = normalizeKey(source.type);
  const candidateType = normalizeKey(candidate.type);
  if (sourceType && candidateType && sourceType === candidateType) {
    score += SCORE_SAME_TYPE;
    reasons.push("same_type");
  }

  const lengthScore = proximityScore(
    source.length_metre,
    candidate.length_metre,
    LENGTH_TOLERANCE_METRES,
    SCORE_LENGTH_PROXIMITY_MAX
  );
  if (lengthScore > 0) {
    score += lengthScore;
    reasons.push("similar_length");
  }

  const priceScore = priceProximityScore(source.price, candidate.price);
  if (priceScore > 0) {
    score += priceScore;
    reasons.push("similar_price");
  }

  const sourceCabins = Number(source.number_of_cabins_num);
  const candidateCabins = Number(candidate.number_of_cabins_num);
  if (
    Number.isFinite(sourceCabins) &&
    Number.isFinite(candidateCabins) &&
    sourceCabins > 0 &&
    sourceCabins === candidateCabins
  ) {
    score += SCORE_SAME_CABINS;
    reasons.push("same_cabins");
  }

  return { score, reasons };
}

/* Fisher–Yates shuffle for random fill + deterministic tie-breaking */
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildRelated(source, dataset, limit) {
  const sourceId = source.boat_id.toString();
  const sourceNameTokens = tokenize(source.name);

  const scored = [];
  for (const candidate of dataset) {
    if (!candidate || candidate.boat_id == null) continue;
    if (candidate.boat_id.toString() === sourceId) continue;

    const { score, reasons } = scoreCandidate(source, candidate, sourceNameTokens);
    if (score > 0) {
      scored.push({ candidate, score, reasons });
    }
  }

  // Sort by score desc; shuffle within identical scores so repeated calls
  // feel fresh rather than always returning the same tied candidates.
  shuffleInPlace(scored);
  scored.sort((a, b) => b.score - a.score);

  const picks = [];
  const pickedIds = new Set();
  for (const entry of scored) {
    if (picks.length >= limit) break;
    const id = entry.candidate.boat_id.toString();
    if (pickedIds.has(id)) continue;
    pickedIds.add(id);
    picks.push({ ...entry.candidate, _match_score: Math.round(entry.score), _match_reasons: entry.reasons });
  }

  // Still short? Fill with random boats that aren't the source or already picked.
  if (picks.length < limit) {
    const remaining = dataset.filter((c) => {
      if (!c || c.boat_id == null) return false;
      const id = c.boat_id.toString();
      return id !== sourceId && !pickedIds.has(id);
    });
    shuffleInPlace(remaining);
    for (const candidate of remaining) {
      if (picks.length >= limit) break;
      pickedIds.add(candidate.boat_id.toString());
      picks.push({ ...candidate, _match_score: 0, _match_reasons: ["random"] });
    }
  }

  return picks;
}

/* ============================================================================
 * Handler
 * ========================================================================== */

function normalizeId(raw) {
  const targetId = raw.toString().trim().replace(/\/+$/, "");
  return targetId.includes(":") ? targetId.split(":").pop() : targetId;
}

function parseLimit(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RELATED_COUNT;
  return Math.min(n, MAX_RELATED_COUNT);
}

export default async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return corsPreflightResponse(req);
    }

    const corsGuard = corsGuardResponse(req);
    if (corsGuard) return corsGuard;

    const url = new URL(req.url);

    const rawId =
      url.searchParams.get("id") ||
      url.searchParams.get("yacht_id") ||
      url.searchParams.get("yachtid") ||
      url.searchParams.get("boat_id");

    if (!rawId) {
      return jsonResponse({ error: "Missing required query param: id" }, 400, {}, req);
    }

    const id = normalizeId(rawId);
    if (!id) {
      return jsonResponse({ error: "Invalid id" }, 400, {}, req);
    }

    const forceRefresh = ["1", "true", "yes"].includes(
      (url.searchParams.get("refresh") || "").toLowerCase()
    );
    const limit = parseLimit(url.searchParams.get("limit"));

    const base = await getCachedBaseDataset({ forceRefresh });
    const dataset = Array.isArray(base?.data) ? base.data : [];

    const source = dataset.find((b) => b?.boat_id?.toString() === id);
    if (!source) {
      return jsonResponse({ error: "Source yacht not found", id }, 404, {}, req);
    }

    const related = buildRelated(source, dataset, limit);

    return jsonResponse(
      {
        meta: {
          source_id: id,
          requested: limit,
          returned: related.length,
          last_updated: base?.last_updated ?? null,
          stale: base?.stale ?? false,
          source_status: base?.source_status ?? null,
          cache: base?.cache ?? null,
        },
        source: {
          boat_id: source.boat_id,
          name: source.name,
          builder: source.builder,
          type: source.type,
          length_metre: source.length_metre,
          price: source.price,
          price_currency: source.price_currency,
        },
        data: related,
      },
      200,
      {},
      req
    );
  } catch (e) {
    return jsonResponse({ error: e?.message || "Unexpected error" }, 500, {}, req);
  }
};