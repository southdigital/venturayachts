import { getConfig, jsonResponse, corsHeaders, corsPreflightResponse } from "./_boats/shared.js";

const DEFAULT_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export default async (req) => {
  const cfg = getConfig();
  const timeoutMs = Math.max(1000, cfg.fetchTimeoutMs || DEFAULT_TIMEOUT_MS);

  if (req?.method === "OPTIONS") {
    return corsPreflightResponse();
  }

  const boatWizardUrl = `https://services.boatwizard.com/bridge/events/${encodeURIComponent(
    cfg.boatWizardEventId
  )}/boats?status=on`;

  try {
    const res = await fetchWithTimeout(boatWizardUrl, timeoutMs);
    const bodyText = await res.text();

    if (!res.ok) {
      return jsonResponse(
        {
          error: `Fetch failed ${res.status}`,
          status: res.status,
          body: bodyText,
        },
        res.status
      );
    }

    return new Response(bodyText, {
      status: 200,
      headers: {
        "content-type": "application/xml; charset=utf-8",
        ...corsHeaders(),
      },
    });
  } catch (e) {
    return jsonResponse({ error: e?.message || "Fetch failed" }, 500);
  }
};
