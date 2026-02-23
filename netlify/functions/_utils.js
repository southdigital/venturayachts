const ALLOWED_ORIGIN_SUFFIX = ".framer.app";

function isAllowedOrigin(origin) {
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    return hostname === "framer.app" || hostname.endsWith(ALLOWED_ORIGIN_SUFFIX);
  } catch {
    return false;
  }
}

function corsHeaders(origin, methods = "GET,POST,OPTIONS") {
  const headers = {
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
  };

  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Vary"] = "Origin";
  }

  return headers;
}

function json(statusCode, body, origin, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
      ...extraHeaders,
    },
    body: JSON.stringify(body, null, 2),
  };
}

function parseBody(event) {
  const contentType =
    event.headers["content-type"] || event.headers["Content-Type"] || "";
  if (!event.body) {
    return { data: null, rawBody: "", contentType };
  }

  let rawBody = event.body;
  if (event.isBase64Encoded) {
    rawBody = Buffer.from(rawBody, "base64").toString("utf8");
  }

  if (contentType.includes("application/json")) {
    try {
      return { data: JSON.parse(rawBody), rawBody, contentType };
    } catch (error) {
      return { data: null, rawBody, contentType, parseError: error.message };
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);
    const data = {};
    for (const [key, value] of params.entries()) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        if (!Array.isArray(data[key])) {
          data[key] = [data[key]];
        }
        data[key].push(value);
      } else {
        data[key] = value;
      }
    }
    return { data, rawBody, contentType };
  }

  if (contentType.includes("text/plain")) {
    return { data: rawBody, rawBody, contentType };
  }

  return { data: rawBody, rawBody, contentType, unsupported: true };
}

module.exports = {
  corsHeaders,
  isAllowedOrigin,
  json,
  parseBody,
};
