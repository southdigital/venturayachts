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

  const boatsComUrl =
    "https://services.boats.com/pls/boats/search" +
    "?fields=DocumentId,YachtWorldID,CabinsCountNumeric,MaximumNumberOfPassengersNumeric,EngineMakeString,EngineModel,EngineFuel,TotalEnginePowerQuantity,BoatLocation,ModelYear,GeneralBoatDescription,MaximumSpeedMeasure,TaxStatusCode,ModelExact,Images,Price,NormNominalLength,MakeStringExact" +
    "&rows=1000" +
    `&key=${encodeURIComponent(cfg.boatsComKey)}` +
    "&currency=original";

  try {
    const res = await fetchWithTimeout(boatsComUrl, timeoutMs);
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
        "content-type": "application/json; charset=utf-8",
        ...corsHeaders(),
      },
    });
  } catch (e) {
    return jsonResponse({ error: e?.message || "Fetch failed" }, 500);
  }
};
