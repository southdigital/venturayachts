import {
  getCachedBaseDataset,
  jsonResponse,
  corsPreflightResponse,
  corsGuardResponse,
} from "./_boats/shared.js";

function normalizeId(raw) {
  if (!raw) return "";
  const trimmed = raw.toString().trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.includes(":") ? trimmed.split(":").pop() : trimmed;
}

function normalizeText(raw) {
  return (raw ?? "").toString().trim().toLowerCase();
}

function sampleRandom(items, count) {
  const pool = items.slice();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

function pushUnique(list, items, excludeIds, limit) {
  for (const item of items) {
    if (list.length >= limit) break;
    const boatId = normalizeId(item?.boat_id);
    const yachtId = normalizeId(item?.yachtworld_id);
    if (excludeIds.has(boatId) || excludeIds.has(yachtId)) continue;
    if (list.find((b) => normalizeId(b?.boat_id) === boatId)) continue;
    list.push(item);
  }
}

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
    const id = url.searchParams.get("id") || url.searchParams.get("boat_id") || url.searchParams.get("boatid");
    const limitParam = Number.parseInt(url.searchParams.get("limit") || "3", 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 10) : 3;

    if (!id) {
      return jsonResponse({ error: "Missing id" }, 400, {}, req);
    }

    const base = await getCachedBaseDataset();
    const data = Array.isArray(base?.data) ? base.data : [];
    if (data.length === 0) {
      return jsonResponse({ error: "No boats available" }, 404, {}, req);
    }

    const targetId = normalizeId(id);
    const target = data.find(
      (b) =>
        normalizeId(b?.boat_id) === targetId ||
        normalizeId(b?.yachtworld_id) === targetId
    );

    let related = [];
    if (target) {
      const targetMake = normalizeText(target?.make);
      const targetModel = normalizeText(target?.model);
      const excludeIds = new Set([normalizeId(target?.boat_id), normalizeId(target?.yachtworld_id)]);

      if (targetModel) {
        const sameModel = data.filter(
          (b) => normalizeText(b?.model) === targetModel
        );
        pushUnique(related, sameModel, excludeIds, limit);
      }

      if (related.length < limit && targetMake) {
        const sameMake = data.filter(
          (b) => normalizeText(b?.make) === targetMake
        );
        pushUnique(related, sameMake, excludeIds, limit);
      }

      if (related.length < limit) {
        const remaining = data.filter((b) => {
          const boatId = normalizeId(b?.boat_id);
          const yachtId = normalizeId(b?.yachtworld_id);
          if (excludeIds.has(boatId) || excludeIds.has(yachtId)) return false;
          return !related.find((r) => normalizeId(r?.boat_id) === boatId);
        });
        related = related.concat(sampleRandom(remaining, limit - related.length));
      }
    } else {
      related = sampleRandom(data, Math.min(limit, data.length));
    }

    return jsonResponse({
      meta: {
        target_id: targetId,
        found: Boolean(target),
        limit,
        last_updated: base?.last_updated ?? null,
        stale: base?.stale ?? false,
        source_status: base?.source_status ?? null,
      },
      data: related,
    }, 200, {}, req);
  } catch (e) {
    return jsonResponse({ error: e?.message || "Unexpected error" }, 500, {}, req);
  }
};
