import { getCachedBaseDataset, applyQueryFiltering, jsonResponse } from "./_boats/shared.js";

export default async (req) => {
  try {
    const url = new URL(req.url);

    // If netlify.toml rewrite is used, detail calls arrive as ?id=<splat>
    const id =
      url.searchParams.get("id") ||
      url.searchParams.get("boat_id") ||
      url.searchParams.get("boatid");

    const base = await getCachedBaseDataset();

    if (id) {
      const targetId = id.toString().trim().replace(/\/+$/, "");
      const normalizedId = targetId.includes(":") ? targetId.split(":").pop() : targetId;

      const found = (base.data || []).find(
        (b) =>
          (b?.boat_id != null && b.boat_id.toString() === normalizedId) ||
          (b?.yachtworld_id != null && b.yachtworld_id.toString() === normalizedId)
      );

      if (!found) {
        return jsonResponse({ error: "Not found", id: normalizedId }, 404);
      }

      return jsonResponse({
        meta: {
          last_updated: base.last_updated,
          stale: base.stale,
          source_status: base.source_status,
        },
        data: found,
      });
    }

    // List route
    const filtered = applyQueryFiltering(base, url);
    return jsonResponse(filtered);
  } catch (e) {
    return jsonResponse({ error: e?.message || "Unexpected error" }, 500);
  }
};
