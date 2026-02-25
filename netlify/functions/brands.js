import { getCachedBaseDataset, jsonResponse, corsPreflightResponse } from "./_boats/shared.js";

function normalizeBrand(value) {
  if (value == null) return "";
  return value.toString().trim().replace(/\s+/g, " ");
}

export default async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return corsPreflightResponse();
    }

    const base = await getCachedBaseDataset();
    const seen = new Map();

    for (const boat of base?.data || []) {
      const brand = normalizeBrand(boat?.make);
      if (!brand) continue;
      const key = brand.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, brand);
      }
    }

    const brands = Array.from(seen.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );

    return jsonResponse({
      meta: {
        last_updated: base?.last_updated ?? null,
        stale: base?.stale ?? false,
        source_status: base?.source_status ?? null,
        total: brands.length,
      },
      data: brands,
    });
  } catch (e) {
    return jsonResponse({ error: e?.message || "Unexpected error" }, 500);
  }
};
