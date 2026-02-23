const { corsHeaders, json } = require("./_utils");

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || "";

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(origin, "GET,OPTIONS"),
      body: "",
    };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: corsHeaders(origin, "GET,OPTIONS"),
      body: "Method Not Allowed",
    };
  }

  const name = event.queryStringParameters?.name || "Captain";
  const payload = {
    message: `Ahoy ${name}!`,
    service: "Ventura Yachts demo endpoint",
    timestamp: new Date().toISOString(),
  };

  return json(200, payload, origin);
};
