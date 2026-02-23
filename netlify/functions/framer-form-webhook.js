const { corsHeaders, json, parseBody } = require("./_utils");

function normalizeSubmission(data) {
  if (!data || typeof data !== "object") return null;
  return {
    name: data.name || data.full_name || "",
    email: data.email || "",
    phone: data.phone || data.phone_number || "",
    boatModel: data.boat_model || data.boatModel || data.model || "",
    budget: data.budget || data.price_range || "",
    message: data.message || data.notes || "",
    timeline: data.timeline || "",
  };
}

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || "";

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(origin, "POST,OPTIONS"),
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders(origin, "POST,OPTIONS"),
      body: "Method Not Allowed",
    };
  }

  const { data, rawBody, contentType, parseError, unsupported } = parseBody(
    event
  );

  if (parseError) {
    return json(
      400,
      {
        received: false,
        error: "Invalid request body.",
        details: parseError,
      },
      origin
    );
  }

  const submission = normalizeSubmission(data);
  const missing = submission
    ? ["name", "email", "boatModel"].filter((key) => !submission[key])
    : ["name", "email", "boatModel"];

  const submissionId = `vy-${Date.now().toString(36)}`;

  console.log("Framer form submission", {
    submissionId,
    contentType,
    missingFields: missing,
    rawLength: rawBody.length,
  });

  return json(
    200,
    {
      received: true,
      submissionId,
      missingFields: missing,
      contentType,
      parsed: Boolean(submission),
      unsupportedContentType: Boolean(unsupported),
    },
    origin
  );
};
