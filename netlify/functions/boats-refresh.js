import { getCachedBaseDataset, jsonResponse } from "./_boats/shared.js";

export default async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405, {
      allow: "POST",
    });
  }

  try {
    const base = await getCachedBaseDataset({ forceRefresh: true });
    return jsonResponse({
      ok: true,
      last_updated: base.last_updated,
      stale: base.stale,
      source_status: base.source_status,
      total: base.data?.length ?? 0,
    });
  } catch (e) {
    return jsonResponse({ ok: false, error: e?.message || "Refresh failed" }, 500);
  }
};
