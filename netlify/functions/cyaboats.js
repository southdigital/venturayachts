import { getStore } from "@netlify/blobs";

/* ============================================================================
 * Configuration defaults
 * ========================================================================== */

const DEFAULT_TTL_SECONDS = 30 * 60;
const DEFAULT_DETAIL_TTL_SECONDS = 30 * 60;
const DEFAULT_PER_PAGE = 10;
const DEFAULT_FETCH_TIMEOUT_MS = 8000;
const DEFAULT_REFRESH_BACKOFF_SECONDS = 120;
const DEFAULT_BLOB_STORE_NAME = "yachts-cache";
const DEFAULT_BLOB_KEY = "cya-base-dataset";
const DEFAULT_DETAIL_BLOB_PREFIX = "cya-detail:";
const BLOB_SCHEMA_VERSION = 1;
const DETAIL_BLOB_SCHEMA_VERSION = 1;

const DEFAULT_CURRCONV_KEY = "32e0eac2807f4ce3ac976f8233ed2f06";

const SUPPORTED_CURRENCIES = ["GBP", "EUR", "USD"];
const DEFAULT_LANGUAGE = "en";
const CORS_ALLOW_ORIGIN = "*";
const CORS_ALLOW_METHODS = "GET,POST,OPTIONS";
const CORS_ALLOW_HEADERS = "Content-Type, Authorization";
const CORS_MAX_AGE = "86400";
const DEFAULT_CORS_ERROR = "Origin not allowed";

let memoryCache = null;
const memoryDetailCache = new Map(); // id -> detail payload
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
    detailTtlSeconds: envInt("YACHTS_DETAIL_CACHE_TTL_SECONDS", DEFAULT_DETAIL_TTL_SECONDS),
    perPage: envInt("YACHTS_PER_PAGE", DEFAULT_PER_PAGE),
    fetchTimeoutMs: envInt("YACHTS_FETCH_TIMEOUT_MS", DEFAULT_FETCH_TIMEOUT_MS),
    refreshBackoffSeconds: envInt("YACHTS_REFRESH_BACKOFF_SECONDS", DEFAULT_REFRESH_BACKOFF_SECONDS),
    cyaUser: envString("CYA_USER_ID"),
    cyaApiCode: envString("CYA_API_CODE"),
    currconvKey: envString("CURRCONV_API_KEY") || DEFAULT_CURRCONV_KEY,
    blobStoreName: envString("YACHTS_BLOB_STORE") || DEFAULT_BLOB_STORE_NAME,
    blobKey: envString("YACHTS_BLOB_KEY") || DEFAULT_BLOB_KEY,
    detailBlobPrefix: envString("YACHTS_DETAIL_BLOB_PREFIX") || DEFAULT_DETAIL_BLOB_PREFIX,
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

  if (numeric > 0 && numeric < 1000) {
    return numeric * 1_000_000;
  }

  return numeric;
}

function toNumberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toOptionalNumber(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? n : "";
}

function yesNoToBool(value) {
  if (value == null) return null;
  const s = value.toString().trim().toLowerCase();
  if (s === "yes" || s === "y" || s === "true" || s === "1") return true;
  if (s === "no" || s === "n" || s === "false" || s === "0") return false;
  return null;
}

function cleanMultiline(value) {
  if (value == null) return "";
  return value.toString().replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
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

// Upstream URLs carry `user` and `apicode`, so never let a raw URL reach a log
// line or an error message.
function redactUrl(url) {
  try {
    const u = new URL(url);
    for (const key of ["user", "apicode"]) {
      if (u.searchParams.has(key)) u.searchParams.set(key, "REDACTED");
    }
    return u.toString();
  } catch {
    return "invalid-url";
  }
}

async function fetchJson(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const res = await fetchWithTimeout(url, options, timeoutMs);

  // Read as text first so a non-JSON body (a PHP error page, a WAF block) can be
  // reported instead of being lost inside a bare "Unexpected token" parse error.
  const text = await res.text();

  if (!res.ok) {
    const err = new Error(`Fetch failed ${res.status} for ${redactUrl(url)}`);
    err.status = res.status;
    err.bodySnippet = text.slice(0, 300);
    throw err;
  }

  try {
    return JSON.parse(text);
  } catch {
    const err = new Error(`Invalid JSON (${res.status}) from ${redactUrl(url)}`);
    err.status = res.status;
    err.bodySnippet = text.slice(0, 300);
    throw err;
  }
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
 * Shared price / size helpers
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

/* ============================================================================
 * CYA list feed normalisation (summary)
 * ========================================================================== */

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

/* ============================================================================
 * CYA detail feed normalisation (ebrochure)
 * ========================================================================== */

function collectDetailImages(yacht) {
  const images = [];
  for (let i = 1; i <= 19; i += 1) {
    const url = yacht?.[`yachtPic${i}`];
    const desc = yacht?.[`yachtDesc${i}`];
    if (!url) continue;
    const u = url.toString().trim();
    if (!u) continue;
    images.push({
      url: u,
      description: (desc || "").toString().trim(),
    });
  }
  return images;
}

function collectDetailVideos(yacht) {
  const videos = [];
  const candidates = [
    { url: yacht?.yachtVideoUrl, title: "Video" },
    { url: yacht?.yachtV360Url, title: "360° tour" },
  ];
  for (const c of candidates) {
    if (!c.url) continue;
    const u = c.url.toString().trim();
    if (!u) continue;
    videos.push({ url: u, title: c.title, description: "", thumbnail: "" });
  }
  return videos;
}

function collectDetailCrew(yacht) {
  const crew = [];

  const captainName = (yacht?.yachtCaptainName || "").toString().trim();
  if (captainName) {
    crew.push({
      name: captainName,
      title: "Captain",
      nationality: (yacht?.yachtCaptainNation || "").toString().trim(),
      born: toOptionalNumber(yacht?.yachtCaptainBorn),
      license: (yacht?.yachtCaptainLic || "").toString().trim(),
      years_sailing: toOptionalNumber(yacht?.yachtCaptainYrSail),
      years_chartering: toOptionalNumber(yacht?.yachtCaptainYrChart),
      languages: (yacht?.yachtCaptainLang || "").toString().trim(),
      photo: "",
    });
  }

  for (let i = 1; i <= 10; i += 1) {
    const name = (yacht?.[`yachtCrew${i}Name`] || "").toString().trim();
    const title = (yacht?.[`yachtCrew${i}Title`] || "").toString().trim();
    const photo = (yacht?.[`yachtCrew${i}Pic`] || "").toString().trim();
    if (!name && !title && !photo) continue;
    crew.push({ name, title, photo });
  }

  return crew;
}

function buildAmenities(yacht) {
  const keys = [
    ["helipad", yacht?.yachtHelipad],
    ["jacuzzi", yacht?.yachtJacuzzi],
    ["gym", yacht?.yachtGym],
    ["stabilizers", yacht?.yachtStabilizers],
    ["elevators", yacht?.yachtElevators],
    ["wheelchair_access", yacht?.yachtWheelChairAccess],
    ["ac", yacht?.yachtAc],
    ["ac_night", yacht?.yachtAcNight],
    ["generator", yacht?.yachtGenerator],
    ["ice_maker", yacht?.yachtIceMaker],
    ["water_maker", yacht?.yachtWaterMaker],
    ["sun_awning", yacht?.yachtSunAwning],
    ["deck_shower", yacht?.yachtDeckShower],
    ["swim_platform", yacht?.yachtSwimPlatform],
    ["boarding_ladder", yacht?.yachtBoardingLadder],
    ["bbq", yacht?.yachtBBQ],
    ["hairdryer", yacht?.yachtHairDryer],
    ["sat_tv", yacht?.yachtSatTv],
    ["video", yacht?.yachtVideo],
    ["ipod", yacht?.yachtIpod],
    ["stereo", yacht?.yachtSalonStereo],
    ["dvd", yacht?.yachtVcrDvd],
    ["board_games", yacht?.yachtBoardGames],
    ["books", yacht?.yachtNumBooks],
  ];
  const out = {};
  for (const [key, raw] of keys) {
    if (raw == null || raw === "") continue;
    const bool = yesNoToBool(raw);
    out[key] = bool != null ? bool : raw.toString().trim();
  }
  return out;
}

function buildToys(yacht) {
  const fields = [
    ["dinghy", yacht?.yachtDinghy],
    ["dinghy_hp", yacht?.yachtDinghyHp],
    ["dinghy_pax", yacht?.yachtDinghyPax],
    ["adult_water_skis", yacht?.yachtAdultWSkis],
    ["kids_water_skis", yacht?.yachtKidsSkis],
    ["jet_skis", yacht?.yachtJetSkis],
    ["wave_runners", yacht?.yachtWaveRun],
    ["knee_board", yacht?.yachtKneeBoard],
    ["stand_up_paddle", yacht?.yachtStandUpPaddle],
    ["wind_surf", yacht?.yachtWindSurf],
    ["snorkel_gear", yacht?.yachtGearSnorkel],
    ["tube", yacht?.yachtTube],
    ["scurfer", yacht?.yachtScurfer],
    ["wake_board", yacht?.yachtWakeBoard],
    ["kayak_1man", yacht?.yacht1ManKayak],
    ["kayak_2man", yacht?.yacht2ManKayak],
    ["seabob", yacht?.yachtSeaBob],
    ["sea_scooter", yacht?.yachtSeaScooter],
    ["kite_boarding", yacht?.yachtKiteBoarding],
    ["float_mats", yacht?.yachtFloatMats],
    ["fishing_gear", yacht?.yachtFishingGear],
    ["fishing_gear_type", yacht?.yachtFishGearType],
    ["num_fishing_rods", yacht?.yachtNumFishRods],
    ["other", yacht?.yachtOtherToys],
  ];
  const out = {};
  for (const [key, raw] of fields) {
    if (raw == null || raw === "") continue;
    const s = raw.toString().trim();
    if (!s) continue;
    if (/^\d+$/.test(s)) {
      out[key] = Number(s);
      continue;
    }
    const bool = yesNoToBool(s);
    out[key] = bool != null ? bool : s;
  }
  return out;
}

function buildDiving(yacht) {
  return {
    onboard: (yacht?.yachtScubaOnboard || "").toString().trim(),
    resort_course: (yacht?.yachtResortCourse || "").toString().trim(),
    full_course: (yacht?.yachtFullCourse || "").toString().trim(),
    license_info: (yacht?.yachtLicenseInfo || "").toString().trim(),
    compressor: (yacht?.yachtCompressor || "").toString().trim(),
    num_tanks: toOptionalNumber(yacht?.yachtNumDiveTanks),
    num_bcs: toOptionalNumber(yacht?.yachtNumBCS),
    num_regs: toOptionalNumber(yacht?.yachtNumRegs),
    num_wetsuits: toOptionalNumber(yacht?.yachtNumWetSuits),
    num_weights: toOptionalNumber(yacht?.yachtNumWeights),
    num_divers: toOptionalNumber(yacht?.yachtNumDivers),
    num_dives: (yacht?.yachtNumDives || "").toString().trim(),
    num_night_dives: toOptionalNumber(yacht?.yachtNumNightDives),
    num_dive_lights: toOptionalNumber(yacht?.yachtNumDiveLights),
    info: cleanMultiline(yacht?.yachtDiveInfo),
    costs: cleanMultiline(yacht?.yachtDiveCosts),
  };
}

function buildSpecsSection(yacht) {
  return {
    length_feet: parseFeetFromSize(yacht?.sizeFeet),
    length_metre:
      parseMetreFromSize(yacht?.sizeMeter, null) || toOptionalNumber(yacht?.yachtLength),
    beam: toOptionalNumber(yacht?.yachtBeam),
    draft: toOptionalNumber(yacht?.yachtDraft),
    gross_tons: toOptionalNumber(yacht?.yachtGrossTons),
    cruise_speed: (yacht?.yachtCruiseSpeed || "").toString().trim(),
    max_speed: (yacht?.yachtMaxSpeed || "").toString().trim(),
    range: (yacht?.yachtRange || "").toString().trim(),
    engines: (yacht?.yachtEngines || "").toString().trim(),
    fuel: (yacht?.yachtFuel || "").toString().trim(),
    consumption_units: (yacht?.yachtConsumptionUnits || "").toString().trim(),
    water_capacity: (yacht?.yachtWaterCapacity || "").toString().trim(),
    flag: (yacht?.yachtFlag || "").toString().trim(),
    home_port: (yacht?.yachtHomePort || "").toString().trim(),
    winter_base_port: (yacht?.yachtWBasePort || "").toString().trim(),
    rig: (yacht?.yachtRig || "").toString().trim(),
    refit: (yacht?.yachtRefit || "").toString().trim(),
  };
}

function buildAccommodations(yacht) {
  return {
    pax: toOptionalNumber(yacht?.yachtPax),
    cabins: toOptionalNumber(yacht?.yachtCabins),
    king: toOptionalNumber(yacht?.yachtKing),
    queen: toOptionalNumber(yacht?.yachtQueen),
    single: toOptionalNumber(yacht?.yachtSingleCabins),
    double: toOptionalNumber(yacht?.yachtDoubleCabins),
    twin: toOptionalNumber(yacht?.yachtTwinCabins),
    pullman: toOptionalNumber(yacht?.yachtPullmanCabins),
    heads: toOptionalNumber(yacht?.yachtHeads),
    electric_heads: toOptionalNumber(yacht?.yachtElectricHeads),
    showers: toOptionalNumber(yacht?.yachtShowers),
    wash_basins: toOptionalNumber(yacht?.yachtWashBasins),
    description: cleanMultiline(yacht?.yachtAccommodations),
  };
}

function buildPolicies(yacht) {
  return {
    children_allowed: yesNoToBool(yacht?.yachtChildrenAllowed),
    min_child_age: (yacht?.yachtMinChildAge || "").toString().trim(),
    smoking: (yacht?.yachtGuestSmoke || "").toString().trim(),
    pets: (yacht?.yachtGuestPet || "").toString().trim(),
    crew_smoke: (yacht?.yachtCrewSmoke || "").toString().trim(),
    crew_pets: (yacht?.yachtCrewPets || "").toString().trim(),
    crew_pet_type: (yacht?.yachtCrewPetType || "").toString().trim(),
    special_diets: (yacht?.yachtSpecialDiets || "").toString().trim(),
    kosher: (yacht?.yachtKosher || "").toString().trim(),
    gay_charters: (yacht?.yachtGayCharters || "").toString().trim(),
    nude_charters: (yacht?.yachtNudeCharters || "").toString().trim(),
    terms: (yacht?.yachtTerms || "").toString().trim(),
    terms_type: (yacht?.yachtTermsType || "").toString().trim(),
    captain_only: (yacht?.yachtCaptainOnly || "").toString().trim(),
    special_conditions: cleanMultiline(yacht?.yachtSpecialCon),
  };
}

function buildSustainability(yacht) {
  return {
    makes_water: yesNoToBool(yacht?.yachtGreenMakeWater),
    reuse_bottles: yesNoToBool(yacht?.yachtGreenReuseBottle),
    other: cleanMultiline(yacht?.yachtGreenOther),
  };
}

function buildManager(yacht) {
  return {
    company: (yacht?.yachtManager || "").toString().trim(),
    name: (yacht?.yachtManagerName || "").toString().trim(),
    phone: (yacht?.yachtManagerPhone || "").toString().trim(),
    toll_free: (yacht?.yachtManagerToll || "").toString().trim(),
    email: (yacht?.yachtManagerEmail || "").toString().trim(),
  };
}

function normalizeCyaDetail(yacht, currConvert) {
  if (!yacht || yacht.yachtId == null) return null;

  const idRaw = yacht.yachtId;
  const images = collectDetailImages(yacht);
  const videos = collectDetailVideos(yacht);
  const main_image = images[0]?.url || "";
  const imageUrls = images.map((img) => img.url);

  const cabinsNum = toOptionalNumber(yacht?.yachtCabins);
  const passengersNum = toOptionalNumber(yacht?.yachtPax);
  const crewNum = toOptionalNumber(yacht?.yachtCrew);

  const length_metre =
    parseMetreFromSize(yacht?.sizeMeter, null) || toOptionalNumber(yacht?.yachtLength);
  let length_feet = parseFeetFromSize(yacht?.sizeFeet);
  if (length_feet === "" && length_metre !== "") {
    length_feet = measurementConverter(length_metre, "Metres");
  }

  const pricing = buildPriceBundle(yacht, currConvert);
  const name = (yacht?.yachtName ?? "").toString().trim();
  const builder = (yacht?.yachtBuilder ?? "").toString().trim();

  return {
    boat_id: idRaw.toString(),
    yacht_id: idRaw.toString(),
    yachtworld_id: "",

    name,
    title: name,
    make: builder,
    model: name,
    builder,
    previous_name: (yacht?.yachtPreviousName || "").toString().trim(),
    logo: (yacht?.yachtLogo || "").toString().trim(),
    year: yacht?.yachtYearBuilt ?? "",
    type: yacht?.yachtType ?? "",
    power_cat: yacht?.yachtPowerCat ?? "",

    ...pricing,
    price_details: cleanMultiline(yacht?.yachtPriceDetails),

    length_metre,
    length_feet,

    number_of_cabins_num: cabinsNum,
    number_of_cabins: cabinsLabel(cabinsNum),
    number_of_passengers_num: passengersNum,
    number_of_passengers: passengersNum !== "" ? passengersLabel(passengersNum) : "",
    crew: crewNum,

    summer_areas: yacht?.yachtSummerArea ?? "",
    winter_areas: yacht?.yachtWinterArea ?? "",
    location_details: cleanMultiline(yacht?.yachtLocationDetails),

    specs: buildSpecsSection(yacht),
    accommodations: buildAccommodations(yacht),
    amenities: buildAmenities(yacht),
    toys: buildToys(yacht),
    diving: buildDiving(yacht),
    policies: buildPolicies(yacht),
    sustainability: buildSustainability(yacht),
    manager: buildManager(yacht),

    broker_web: yacht?.yachtBrokerWeb ?? "",
    user_web: yacht?.yachtUserWeb ?? "",
    full_ebrochure: yacht?.yachtFullEbrochure ?? "",
    full_rates: yacht?.yachtFullRates ?? "",
    layout: yacht?.yachtLayout ?? "",
    sample_menu: yacht?.yachtSampleMenu ?? "",
    internet: yacht?.yachtInternet ?? "",
    communicate: yacht?.yachtCommunicate ?? "",

    crew_list: collectDetailCrew(yacht),

    main_image,
    image: imageUrls,
    images,
    videos,

    feed: "cya",
    feed_source: "ebrochure",
  };
}

/* ============================================================================
 * Fetch + build list dataset
 * ========================================================================== */

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
    // The only thing that surfaces to callers is "CYA feed failed", so record the
    // real upstream reason here or it is lost entirely.
    const reason = cyaResult.reason;
    console.log("[yachts] cya list fetch failed", {
      url: redactUrl(cyaUrl),
      status: reason?.status ?? null,
      name: reason?.name ?? null,
      message: reason?.message || String(reason),
      body: reason?.bodySnippet ?? null,
    });
    source_status.cya = {
      ok: false,
      error: reason?.message || "cya failed",
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
 * Fetch + build single yacht detail (ebrochure)
 * ========================================================================== */

async function fetchAndBuildDetail(id) {
  const cfg = getConfig();

  if (!cfg.cyaUser) throw new Error("Missing env var CYA_USER_ID");
  if (!cfg.cyaApiCode) throw new Error("Missing env var CYA_API_CODE");

  const detailUrl =
    "https://www.centralyachtagent.com/snapins/json-ebrochure.php" +
    `?user=${encodeURIComponent(cfg.cyaUser)}` +
    `&idin=${encodeURIComponent(id)}` +
    `&apicode=${encodeURIComponent(cfg.cyaApiCode)}`;

  const source_status = {
    cya: { ok: true, error: null },
  };

  const [currResult, detailResult] = await Promise.allSettled([
    getCurrConvert(cfg),
    fetchJson(detailUrl, {}, cfg.fetchTimeoutMs),
  ]);

  const currConvert =
    currResult.status === "fulfilled" && currResult.value ? currResult.value : {};

  if (detailResult.status !== "fulfilled") {
    source_status.cya = {
      ok: false,
      error: detailResult.reason?.message || "cya detail failed",
    };
    const err = new Error("CYA detail feed failed");
    err.source_status = source_status;
    throw err;
  }

  const payload = detailResult.value;
  const yachtNode = payload?.yacht ?? payload ?? null;
  const normalized = normalizeCyaDetail(yachtNode, currConvert);

  if (!normalized) {
    const err = new Error("Yacht detail not found");
    err.source_status = source_status;
    err.notFound = true;
    throw err;
  }

  return {
    last_updated: new Date().toISOString(),
    stale: false,
    source_status,
    data: normalized,
  };
}

/* ============================================================================
 * Blob-backed caching — shared helpers
 * ========================================================================== */

function getBlobStore(cfg) {
  if (blobStore) return blobStore;
  blobStore = getStore(cfg.blobStoreName);
  return blobStore;
}

function serializeBlobPayload(payload, schemaVersion = BLOB_SCHEMA_VERSION) {
  return JSON.stringify({
    v: schemaVersion,
    stored_at: new Date().toISOString(),
    payload,
  });
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

function isExpired(cached, ttlSeconds) {
  if (!cached?.last_updated) return true;
  const ts = Date.parse(cached.last_updated);
  if (!Number.isFinite(ts)) return true;
  return (Date.now() - ts) / 1000 > ttlSeconds;
}

/* ============================================================================
 * Blob-backed caching — list dataset
 * ========================================================================== */

async function readBlobDataset(cfg, { consistency = "strong" } = {}) {
  try {
    const store = getBlobStore(cfg);
    const raw = await store.get(cfg.blobKey, { consistency });
    return parseBlobPayload(raw, BLOB_SCHEMA_VERSION, (p) => Array.isArray(p?.data));
  } catch (e) {
    console.log("[yachts] blob read failed", e?.message || e);
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
    console.log("[yachts] blob write failed", e?.message || e);
  }
}

async function getCachedBaseDataset({ forceRefresh = false } = {}) {
  const cfg = getConfig();
  const cachedData = memoryCache;
  const expired = cachedData ? isExpired(cachedData, cfg.ttlSeconds) : true;
  const now = Date.now();

  if (!forceRefresh && cachedData && !expired) {
    return cachedData;
  }

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
 * Blob-backed caching — per-yacht detail
 * ========================================================================== */

function detailBlobKey(cfg, id) {
  return `${cfg.detailBlobPrefix}${id}`;
}

async function readBlobDetail(cfg, id, { consistency = "strong" } = {}) {
  try {
    const store = getBlobStore(cfg);
    const raw = await store.get(detailBlobKey(cfg, id), { consistency });
    return parseBlobPayload(
      raw,
      DETAIL_BLOB_SCHEMA_VERSION,
      (p) => p?.data && p.data.boat_id
    );
  } catch (e) {
    console.log("[yachts] detail blob read failed", e?.message || e);
    return null;
  }
}

async function writeBlobDetail(cfg, id, payload) {
  try {
    const store = getBlobStore(cfg);
    const body = serializeBlobPayload(payload, DETAIL_BLOB_SCHEMA_VERSION);
    await store.set(detailBlobKey(cfg, id), body, {
      metadata: {
        schema: String(DETAIL_BLOB_SCHEMA_VERSION),
        stored_at: payload?.last_updated || new Date().toISOString(),
        yacht_id: String(id),
      },
    });
  } catch (e) {
    console.log("[yachts] detail blob write failed", e?.message || e);
  }
}

async function getCachedDetail(id, { forceRefresh = false } = {}) {
  const cfg = getConfig();
  const key = id.toString();
  const cached = memoryDetailCache.get(key) || null;
  const expired = cached ? isExpired(cached, cfg.detailTtlSeconds) : true;

  if (!forceRefresh && cached && !expired) {
    return cached;
  }

  if (!forceRefresh && !cached) {
    const blob = await readBlobDetail(cfg, key, { consistency: "strong" });
    if (blob && !isExpired(blob, cfg.detailTtlSeconds)) {
      memoryDetailCache.set(key, blob);
      return blob;
    }
  }

  try {
    const built = await fetchAndBuildDetail(key);
    memoryDetailCache.set(key, built);
    await writeBlobDetail(cfg, key, built);
    return built;
  } catch (e) {
    if (e?.notFound) throw e;

    const errorMessage = e?.message || "detail refresh failed";
    const memFallback = applyFallbackMeta(cached, "fetch_failed", {
      source: "memory",
      error: errorMessage,
    });
    if (memFallback) {
      memoryDetailCache.set(key, memFallback);
      return memFallback;
    }
    const blob = await readBlobDetail(cfg, key, { consistency: "strong" });
    const blobFallback = applyFallbackMeta(blob, "fetch_failed", {
      source: "blob",
      error: errorMessage,
    });
    if (blobFallback) {
      memoryDetailCache.set(key, blobFallback);
      return blobFallback;
    }
    throw e;
  }
}

/* ============================================================================
 * Query filtering + pagination (list)
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

  const brands = stripApostrophes(params.get("brands") || params.get("brand") || params.get("builder") || "");
  if (brands !== "") {
    const needle = brands.toLowerCase();
    rows = rows.filter((b) => {
      const make = (b.make ?? "").toString().toLowerCase();
      const builder = (b.builder ?? "").toString().toLowerCase();
      return make === needle || builder === needle;
    });
  }

  const yachtType = stripApostrophes(params.get("type") || params.get("yachtType") || "");
  if (yachtType !== "") {
    const needle = yachtType.toLowerCase();
    rows = rows.filter((b) => (b.type ?? "").toString().toLowerCase() === needle);
  }

  const pricefromVal = parsePriceFilterValue(params.get("pricefrom"));
  if (pricefromVal != null) {
    rows = rows.filter((b) => parseFormattedNumber(b[priceCol]) >= pricefromVal);
  }
  const pricetoVal = parsePriceFilterValue(params.get("priceto"));
  if (pricetoVal != null) {
    rows = rows.filter((b) => parseFormattedNumber(b[priceCol]) < pricetoVal);
  }

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

  const minpax = stripApostrophes(params.get("minpax") || params.get("minpassengers") || "");
  if (minpax !== "") {
    const paxVal = Number(minpax);
    if (Number.isFinite(paxVal)) {
      rows = rows.filter((b) => Number(b.number_of_passengers_num ?? 0) >= paxVal);
    }
  }

  const region = stripApostrophes(params.get("region") || params.get("area") || "").toLowerCase();
  if (region !== "") {
    rows = rows.filter((b) => {
      const haystack = `${b.winter_areas ?? ""} ${b.summer_areas ?? ""}`.toLowerCase();
      return haystack.includes(region);
    });
  }

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

function normalizeId(raw) {
  const targetId = raw.toString().trim().replace(/\/+$/, "");
  return targetId.includes(":") ? targetId.split(":").pop() : targetId;
}

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

    const forceRefresh = ["1", "true", "yes"].includes(
      (url.searchParams.get("refresh") || "").toLowerCase()
    );

    const rawId =
      url.searchParams.get("id") ||
      url.searchParams.get("yacht_id") ||
      url.searchParams.get("yachtid") ||
      url.searchParams.get("boat_id");

    // Detail route — fetch the rich ebrochure payload for a single yacht
    if (rawId) {
      const id = normalizeId(rawId);
      if (!id) {
        return jsonResponse({ error: "Invalid id" }, 400, {}, req);
      }

      try {
        const detail = await getCachedDetail(id, { forceRefresh });
        return jsonResponse(
          {
            meta: {
              last_updated: detail.last_updated,
              stale: detail.stale,
              source_status: detail.source_status,
              cache: detail.cache ?? null,
            },
            data: detail.data,
          },
          200,
          {},
          req
        );
      } catch (e) {
        if (e?.notFound) {
          return jsonResponse({ error: "Not found", id }, 404, {}, req);
        }
        throw e;
      }
    }

    // List route
    const base = await getCachedBaseDataset({ forceRefresh });
    const filtered = applyQueryFiltering(base, url);
    return jsonResponse(filtered, 200, {}, req);
  } catch (e) {
    return jsonResponse({ error: e?.message || "Unexpected error" }, 500, {}, req);
  }
};