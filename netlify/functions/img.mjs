import sharp from "sharp";

// Netlify Function (v2) — on-the-fly image resize + WebP transcode.
// Served at /img so Framer can request appropriately-sized variants of the
// full-resolution photos coming from the boat feed. We are on the free plan,
// so this deliberately avoids the Netlify Image CDN.
export const config = { path: "/img" };

// Only these upstream hosts may be fetched (SSRF guard). These are the two
// origins the feed serves photo URLs from.
const ALLOWED_HOSTS = new Set([
  "images.boatsgroup.com",
  "www.centralyachtagent.com",
]);

// images.boatsgroup.com 404s generic proxies (weserv/wsrv included). It only
// serves the bytes when the request looks like a real browser AND carries the
// expected Referer — so we spoof both.
const UPSTREAM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Referer: "https://ventura-testing.link",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
};

function clamp(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export default async (req) => {
  const params = new URL(req.url).searchParams;
  const target = params.get("url");

  if (!target) {
    return new Response("Missing 'url' query parameter", { status: 400 });
  }

  // Validate the upstream URL against the allowlist before touching the network.
  let upstream;
  try {
    upstream = new URL(target);
  } catch {
    return new Response("Invalid 'url' query parameter", { status: 400 });
  }
  if (
    (upstream.protocol !== "https:" && upstream.protocol !== "http:") ||
    !ALLOWED_HOSTS.has(upstream.hostname)
  ) {
    return new Response("Host not allowed", { status: 400 });
  }

  const width = clamp(params.get("w"), 16, 2000, 640);
  const quality = clamp(params.get("q"), 30, 90, 75);

  try {
    const res = await fetch(upstream, {
      headers: UPSTREAM_HEADERS,
      redirect: "follow",
    });

    if (!res.ok) {
      console.error(`[img] upstream ${res.status} for ${upstream.href}`);
      // Never break the image — fall back to the original.
      return Response.redirect(upstream.href, 302);
    }

    const input = Buffer.from(await res.arrayBuffer());

    const output = await sharp(input)
      .rotate() // respect EXIF orientation
      .resize({ width, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

    return new Response(output, {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        // Immutable for browsers; durable so Netlify's edge caches the
        // transformed bytes and the function isn't re-invoked per request.
        "Cache-Control": "public, max-age=31536000, immutable",
        "Netlify-CDN-Cache-Control":
          "public, durable, s-maxage=31536000",
      },
    });
  } catch (err) {
    console.error(`[img] failed for ${upstream.href}:`, err);
    // On any transform/network failure, redirect to the original so the
    // image still renders.
    return Response.redirect(upstream.href, 302);
  }
};
