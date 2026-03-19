export default async (req, context) => {
  if (req.method !== "POST") {
    return json({ message: "Method not allowed" }, 405)
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
      return json({ message: "Missing required fields." }, 400)
    }

    if (!recaptchaToken) {
      return json({ message: "Missing reCAPTCHA token." }, 400)
    }

    const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY
    const HUBSPOT_PRIVATE_APP_TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN

    if (!RECAPTCHA_SECRET_KEY) {
      return json({ message: "Missing RECAPTCHA_SECRET_KEY env var." }, 500)
    }

    if (!HUBSPOT_PRIVATE_APP_TOKEN) {
      return json({ message: "Missing HUBSPOT_PRIVATE_APP_TOKEN env var." }, 500)
    }

    // 1) Verify reCAPTCHA with Google
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
      return json(
        {
          message: "Captcha verification failed.",
          details: captchaData,
        },
        400
      )
    }

    // Optional hardening for reCAPTCHA v3
    if (typeof captchaData.action === "string" && captchaData.action !== "submit") {
      return json(
        {
          message: "Invalid reCAPTCHA action.",
          details: captchaData,
        },
        400
      )
    }

    if (typeof captchaData.score === "number" && captchaData.score < 0.5) {
      return json(
        {
          message: "Spam check failed.",
          score: captchaData.score,
        },
        400
      )
    }

    // 2) Submit to HubSpot secure endpoint
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

    const hubspotData = await hubspotRes.json().catch(() => ({}))

    if (!hubspotRes.ok) {
      return json(
        {
          message: "HubSpot submission failed.",
          details: hubspotData,
        },
        hubspotRes.status
      )
    }

    return json({
      ok: true,
      redirectUri: hubspotData.redirectUri || "",
      inlineMessage: hubspotData.inlineMessage || "",
    })
  } catch (error) {
    return json(
      {
        message: "Server error.",
        details: error?.message || "Unknown error",
      },
      500
    )
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  })
}

export const config = {
  path: "/api/hubspot-submit",
}