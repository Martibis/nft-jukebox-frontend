import { NextResponse } from "next/server";
import sharp from "sharp";
import { validateTarget } from "@/lib/urlGuard";

export const dynamic = "force-dynamic";

const ALLOWED_WIDTHS = new Set([256, 512, 1024]);
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const WEBP_QUALITY = 78;

// Small in-process LRU so warm instances skip refetch + recompress entirely.
// In production the CDN cache (via Cache-Control below) does the real work.
const CACHE_MAX_ENTRIES = 60;
const cache = new Map(); // key -> Buffer

function remember(key, buffer) {
  cache.delete(key);
  cache.set(key, buffer);
  if (cache.size > CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
}

// IPFS / Arweave URLs are content-addressed: the bytes behind them can
// never change, so the compressed result can be cached forever.
const isImmutableSource = (url) =>
  /\/ipfs\//i.test(url) || /(^|\.)arweave\.net$/i.test(new URL(url).hostname);

const cacheControlFor = (url) =>
  isImmutableSource(url)
    ? "public, max-age=31536000, immutable"
    : "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

// Anything we can't (or shouldn't) compress falls back to the plain proxy,
// so the image still renders.
const proxyRedirect = (request, target) =>
  NextResponse.redirect(
    new URL("/api/proxy?url=" + encodeURIComponent(target), request.url),
    302
  );

export async function GET(request) {
  const { searchParams } = request.nextUrl;
  const target = searchParams.get("url");
  const width = parseInt(searchParams.get("w") || "512", 10);
  // png: for consumers that can't decode webp (the OG image renderer)
  const asPng = searchParams.get("fmt") === "png";

  if (!target) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }
  if (!ALLOWED_WIDTHS.has(width)) {
    return NextResponse.json({ error: "Unsupported width" }, { status: 400 });
  }

  const { url, error } = validateTarget(target);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const cacheKey = (asPng ? "png:" : "") + width + ":" + url.toString();
  const hit = cache.get(cacheKey);
  if (hit) {
    return new Response(hit, {
      headers: {
        "Content-Type": asPng ? "image/png" : "image/webp",
        "Cache-Control": cacheControlFor(url.toString()),
      },
    });
  }

  try {
    const upstream = await fetch(url.toString(), {
      headers: { "accept-encoding": "identity" },
      redirect: "follow",
      cache: "no-store",
    });
    if (!upstream.ok) {
      return proxyRedirect(request, target);
    }

    const type = (upstream.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    // SVGs are already tiny vectors; non-images aren't ours to compress.
    if (!type.startsWith("image/") || type === "image/svg+xml") {
      return proxyRedirect(request, target);
    }

    const source = Buffer.from(await upstream.arrayBuffer());
    if (source.length > MAX_SOURCE_BYTES) {
      return proxyRedirect(request, target);
    }

    // animated: keeps GIF/WebP animations intact in the output. PNG can't
    // animate, so that path takes the first frame instead.
    const animated =
      !asPng && (type === "image/gif" || type === "image/webp");
    const pipeline = sharp(source, { animated }).resize({
      width,
      withoutEnlargement: true,
    });
    const output = await (asPng
      ? pipeline.png()
      : pipeline.webp({ quality: WEBP_QUALITY, effort: 4 })
    ).toBuffer();

    remember(cacheKey, output);

    return new Response(output, {
      headers: {
        "Content-Type": asPng ? "image/png" : "image/webp",
        "Cache-Control": cacheControlFor(url.toString()),
      },
    });
  } catch (_) {
    return proxyRedirect(request, target);
  }
}
