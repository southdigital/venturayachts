const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", {
      status: 204,
      headers: CORS_HEADERS,
    })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ message: "Method not allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    })
  }

  try {
    const body = await req.json()

    const {
      firstname,
      lastname,
      email,
      mobilephone,
      message,
      reference_boat,
      marketingConsent,
      recaptchaToken,
      hutk,
      pageUri,
      pageName,
    } = body || {}

    if (!firstname || !lastname || !email || !mobilephone) {
      return new Response(
        JSON.stringify({ message: "Missing required fields." }),
        { status: 400, headers: CORS_HEADERS }
      )
    }

    if (!recaptchaToken) {
      return new Response(
        JSON.stringify({ message: "Missing reCAPTCHA token." }),
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY
    const HUBSPOT_PRIVATE_APP_TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN

    if (!RECAPTCHA_SECRET_KEY) {
      return new Response(
        JSON.stringify({ message: "Missing RECAPTCHA_SECRET_KEY env var." }),
        { status: 500, headers: CORS_HEADERS }
      )
    }

    if (!HUBSPOT_PRIVATE_APP_TOKEN) {
      return new Response(
        JSON.stringify({ message: "Missing HUBSPOT_PRIVATE_APP_TOKEN env var." }),
        { status: 500, headers: CORS_HEADERS }
      )
    }

    // Verify reCAPTCHA
    const captchaRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        secret: RECAPTCHA_SECRET_KEY,
        response: recaptchaToken,
      }).toString(),
    })

    const captchaData = await captchaRes.json()

    if (!captchaData.success) {
      return new Response(
        JSON.stringify({
          message: "Captcha verification failed.",
          details: captchaData,
        }),
        { status: 400, headers: CORS_HEADERS }
      )
    }

    if (typeof captchaData.action === "string" && captchaData.action !== "submit") {
      return new Response(
        JSON.stringify({
          message: "Invalid reCAPTCHA action.",
          details: captchaData,
        }),
        { status: 400, headers: CORS_HEADERS }
      )
    }

    if (typeof captchaData.score === "number" && captchaData.score < 0.5) {
      return new Response(
        JSON.stringify({
          message: "Spam check failed.",
          score: captchaData.score,
        }),
        { status: 400, headers: CORS_HEADERS }
      )
    }

    // Submit to HubSpot secure endpoint
    const portalId = "25403953"
    const formGuid = "a083cd31-c7d0-4dfc-842e-560321804bbe"

    const hubspotPayload = {
      submittedAt: Date.now(),
      fields: [
        { name: "firstname", value: String(firstname || "") },
        { name: "lastname", value: String(lastname || "") },
        { name: "email", value: String(email || "") },
        { name: "mobilephone", value: String(mobilephone || "") },
        { name: "message", value: String(message || "") },
        { name: "reference_boat", value: String(reference_boat || "") },
      ],
      context: {
        hutk: String(hutk || ""),
        pageUri: String(pageUri || ""),
        pageName: String(pageName || ""),
      },
      legalConsentOptions: {
        consent: {
          consentToProcess: true,
          text:
            "By clicking submit below, you consent to allow Ventura UK Limited to store and process the personal information submitted above to provide you the content requested.",
          communications: [
            {
              value: Boolean(marketingConsent),
              subscriptionTypeId: 129049009,
              text: "I agree to receive other communications from Ventura UK Limited.",
            },
          ],
        },
      },
    }

    const hubspotRes = await fetch(
      `https://api.hsforms.com/submissions/v3/integration/secure/submit/${portalId}/${formGuid}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${HUBSPOT_PRIVATE_APP_TOKEN}`,
        },
        body: JSON.stringify(hubspotPayload),
      }
    )

    const rawText = await hubspotRes.text()
    let hubspotData = {}
    try {
      hubspotData = rawText ? JSON.parse(rawText) : {}
    } catch {
      hubspotData = { rawText }
    }

    if (!hubspotRes.ok) {
      return new Response(
        JSON.stringify({
          message: "HubSpot submission failed.",
          status: hubspotRes.status,
          details: hubspotData,
        }),
        { status: hubspotRes.status, headers: CORS_HEADERS }
      )
    }

    return new Response(
      JSON.stringify({
        ok: true,
        redirectUri: hubspotData.redirectUri || "",
        inlineMessage: hubspotData.inlineMessage || "",
      }),
      { status: 200, headers: CORS_HEADERS }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        message: "Server error.",
        details: error?.message || String(error),
      }),
      { status: 500, headers: CORS_HEADERS }
    )
  }
}