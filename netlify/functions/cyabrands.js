import { getStore } from "@netlify/blobs";

/* ============================================================================
 * Configuration defaults
 * ========================================================================== */

const DEFAULT_TTL_SECONDS = 60 * 60; // builders change rarely, cache longer
const DEFAULT_FETCH_TIMEOUT_MS = 8000;
const DEFAULT_REFRESH_BACKOFF_SECONDS = 120;
const DEFAULT_BLOB_STORE_NAME = "yachts-cache";
const DEFAULT_BLOB_KEY = "cya-builders";
const BLOB_SCHEMA_VERSION = 1;

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
 * CORS (same NETLIFY_ALLOWED_ORIGINS env var as the other endpoints)
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
    ttlSeconds: envInt("BUILDERS_CACHE_TTL_SECONDS", DEFAULT_TTL_SECONDS),
    fetchTimeoutMs: envInt("BUILDERS_FETCH_TIMEOUT_MS", DEFAULT_FETCH_TIMEOUT_MS),
    refreshBackoffSeconds: envInt("BUILDERS_REFRESH_BACKOFF_SECONDS", DEFAULT_REFRESH_BACKOFF_SECONDS),
    cyaUser: envString("CYA_USER_ID"),
    cyaApiCode: envString("CYA_API_CODE"),
    blobStoreName: envString("YACHTS_BLOB_STORE") || DEFAULT_BLOB_STORE_NAME,
    blobKey: envString("BUILDERS_BLOB_KEY") || DEFAULT_BLOB_KEY,
  };
}

/* ============================================================================
 * Fetch helpers
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

/* ============================================================================
 * CYA builders normalisation
 * ========================================================================== */

function normalizeBuilderName(raw) {
  if (raw == null) return "";
  return raw
    .toString()
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();
}

function dedupeSortBuilders(items) {
  const seen = new Map(); // lowerCase -> display value (prefer first canonical seen)

  for (const item of items) {
    const name = normalizeBuilderName(item?.builderName);
    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, name);
    }
  }

  const list = Array.from(seen.values());
  list.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return list;
}

/* ============================================================================
 * Fetch + build base dataset
 * ========================================================================== */

async function fetchAndBuildBaseDataset() {
  const cfg = getConfig();

  if (!cfg.cyaUser) throw new Error("Missing env var CYA_USER_ID");
  if (!cfg.cyaApiCode) throw new Error("Missing env var CYA_API_CODE");

  const cyaUrl =
    "https://www.centralyachtagent.com/snapins/json-builders.php" +
    `?user=${encodeURIComponent(cfg.cyaUser)}` +
    `&apicode=${encodeURIComponent(cfg.cyaApiCode)}`;

  const source_status = {
    cya: { ok: true, error: null },
  };

  let rawItems = [];
  try {
    const payload = await fetchJson(cyaUrl, {}, cfg.fetchTimeoutMs);
    rawItems = Array.isArray(payload?.builders)
      ? payload.builders
      : Array.isArray(payload)
      ? payload
      : [];
  } catch (e) {
    source_status.cya = {
      ok: false,
      error: e?.message || "cya builders failed",
    };
    const err = new Error("CYA builders feed failed");
    err.source_status = source_status;
    throw err;
  }

  const data = dedupeSortBuilders(rawItems);

  return {
    last_updated: new Date().toISOString(),
    stale: false,
    source_status,
    total: data.length,
    data,
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
    console.log("[builders] blob read failed", e?.message || e);
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
    console.log("[builders] blob write failed", e?.message || e);
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

  // Cold-start: hydrate from blob before hitting upstream
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
 * Query helpers
 * ========================================================================== */

function stripApostrophes(value) {
  if (value == null) return "";
  return value.toString().replace(/\\/g, "").replace(/'/g, "");
}

function applyQueryFiltering(base, url) {
  const params = url.searchParams;
  let rows = Array.isArray(base?.data) ? base.data.slice() : [];

  const query = stripApostrophes(params.get("query") || params.get("q") || "").trim().toLowerCase();
  if (query !== "") {
    rows = rows.filter((name) => name.toLowerCase().includes(query));
  }

  const startsWith = stripApostrophes(params.get("startsWith") || "").trim().toLowerCase();
  if (startsWith !== "") {
    rows = rows.filter((name) => name.toLowerCase().startsWith(startsWith));
  }

  return {
    meta: {
      last_updated: base?.last_updated ?? null,
      stale: base?.stale ?? false,
      source_status: base?.source_status ?? null,
      total: rows.length,
    },
    data: rows,
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
    const forceRefresh = ["1", "true", "yes"].includes(
      (url.searchParams.get("refresh") || "").toLowerCase()
    );

    const base = await getCachedBaseDataset({ forceRefresh });
    const filtered = applyQueryFiltering(base, url);
    return jsonResponse(filtered, 200, {}, req);
  } catch (e) {
    return jsonResponse({ error: e?.message || "Unexpected error" }, 500, {}, req);
  }
};