import {
  fetchAndBuildBaseDataset,
  applyQueryFiltering,
  jsonResponse,
  corsPreflightResponse,
  corsGuardResponse,
} from "./_boats/shared.js";

export default async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return corsPreflightResponse(req);
    }

    const corsGuard = corsGuardResponse(req);
    if (corsGuard) {
      return corsGuard;
    }

    const url = new URL(req.url);

    // Always fetch fresh — no caching, no blob store
    const base = await fetchAndBuildBaseDataset();

    // Check if any filters are applied (excluding pagination/currency/measurement/sort)
    const filterKeys = [
      "brands",
      "pricefrom",
      "priceto",
      "lengthfrom",
      "lengthto",
      "yearfrom",
      "yearto",
      "mincabins",
      "keywordsearch",
    ];
    const hasFilters = filterKeys.some((k) => url.searchParams.has(k));

    if (hasFilters) {
      // Use shared filtering logic but return ALL matching rows (no pagination)
      const filtered = applyQueryFiltering(base, url);

      // filtered.data is paginated — we need all rows instead.
      // Re-run filtering manually to get unpaginated results.
      // Easiest: set a very high per-page via the same function won't work
      // since perPage comes from config. So we just return full filtered set below.
    }

    // Apply filtering + sorting without pagination
    const params = url.searchParams;
    const sortby = (params.get("sortby") || "").trim() || "low";
    const currencyRaw = (params.get("currencyVal") || "").trim();
    const currencyVal = currencyRaw ? currencyRaw.toUpperCase() : "EUR";
    const measurementVal = (params.get("measurementVal") || "").trim() || "Metres";

    const priceCol =
      currencyVal === "GBP"
        ? "price_gbp"
        : currencyVal === "EUR"
        ? "price_eur"
        : currencyVal === "USD"
        ? "price_usd"
        : "price_gbp";

    const measurementCol =
      measurementVal === "Feet" ? "length_feet" : "length_metre";

    let rows = Array.isArray(base?.data) ? base.data.slice() : [];

    // --- Filters (mirroring shared.js logic) ---
    const brands = (params.get("brands") || "").trim();
    if (brands) {
      rows = rows.filter((b) => (b.make ?? "") === brands);
    }

    const parsePriceFilter = (raw) => {
      if (raw == null) return null;
      const cleaned = raw.toString().trim().replace(/[^0-9.,mM]/g, "");
      if (!cleaned) return null;
      const hasMillion = /m/i.test(cleaned);
      const num = parseFloat(cleaned.replace(/[,mM]/g, ""));
      if (!Number.isFinite(num)) return null;
      if (hasMillion) return num * 1_000_000;
      if (num > 0 && num < 1000) return num * 1_000_000;
      return num;
    };

    const parseFormatted = (v) => {
      if (v == null || v === "") return 0;
      const n = parseFloat(v.toString().replace(/,/g, ""));
      return Number.isFinite(n) ? n : 0;
    };

    const pricefrom = parsePriceFilter(params.get("pricefrom"));
    if (pricefrom != null) {
      rows = rows.filter((b) => parseFormatted(b[priceCol]) >= pricefrom);
    }

    const priceto = parsePriceFilter(params.get("priceto"));
    if (priceto != null) {
      rows = rows.filter((b) => parseFormatted(b[priceCol]) < priceto);
    }

    const lengthfrom = parseFloat(params.get("lengthfrom"));
    if (Number.isFinite(lengthfrom)) {
      rows = rows.filter((b) => Number(b[measurementCol] ?? 0) >= lengthfrom);
    }

    const lengthto = parseFloat(params.get("lengthto"));
    if (Number.isFinite(lengthto)) {
      rows = rows.filter((b) => Number(b[measurementCol] ?? 0) <= lengthto);
    }

    const yearfrom = parseFloat(params.get("yearfrom"));
    if (Number.isFinite(yearfrom)) {
      rows = rows.filter((b) => Number(b.year ?? 0) >= yearfrom);
    }

    const yearto = parseFloat(params.get("yearto"));
    if (Number.isFinite(yearto)) {
      rows = rows.filter((b) => Number(b.year ?? 0) <= yearto);
    }

    const mincabins = parseFloat(params.get("mincabins"));
    if (Number.isFinite(mincabins)) {
      rows = rows.filter(
        (b) => Number(b.number_of_cabins_num ?? 0) >= mincabins
      );
    }

    const keywordsearch = (params.get("keywordsearch") || "").trim();
    if (keywordsearch) {
      const searchWords = keywordsearch.toLowerCase().split(/\s+/).filter(Boolean);
      rows = rows.filter((b) => {
        const words = `${b.make ?? ""} ${b.model ?? ""}`
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean);
        return searchWords.every((w) => words.includes(w));
      });
    }

    // --- Sort ---
    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    if (sortby === "high") {
      rows.sort((a, b) => num(b.price) - num(a.price));
    } else if (sortby === "lengthshort") {
      rows.sort((a, b) => num(a.length_metre) - num(b.length_metre));
    } else if (sortby === "lengthlong") {
      rows.sort((a, b) => num(b.length_metre) - num(a.length_metre));
    } else {
      rows.sort((a, b) => num(a.price) - num(b.price));
    }

    return jsonResponse(
      {
        meta: {
          total: rows.length,
          sortby,
          currencyVal,
          measurementVal,
          last_updated: base.last_updated,
          partial: base.partial ?? false,
          source_status: base.source_status,
        },
        data: rows,
      },
      200,
      {},
      req
    );
  } catch (e) {
    return jsonResponse(
      { error: e?.message || "Unexpected error" },
      500,
      {},
      req
    );
  }
};