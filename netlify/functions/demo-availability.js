const { corsHeaders, json } = require("./_utils");

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

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

  const boatId = event.queryStringParameters?.boatId || "ventura-42";
  const today = new Date();
  const available = boatId === "ventura-42";

  const payload = {
    boatId,
    available,
    nextAvailableDate: available ? today.toISOString() : addDays(today, 21),
    note: available
      ? "Ready for immediate showing."
      : "In charter; next availability is estimated.",
  };

  return json(200, payload, origin);
};
