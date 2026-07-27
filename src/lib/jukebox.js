import { ethers } from "ethers";

export const JUKE_TOKEN = "0xEb01299cd6C93E1030280234E4Cd62E2fe7F8ad4";

// Free public RPCs, in order of preference. Anything shipped to the browser
// is public by definition, so no keyed endpoints belong in this list.
export const RPC_URLS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.drpc.org",
  "https://1rpc.io/eth",
  "https://cloudflare-eth.com",
];

// Server-side RPC list: a private keyed endpoint (e.g. Infura/Alchemy) from
// the environment gets top priority, public RPCs remain as fallback.
export const serverRpcUrls = () =>
  [process.env.ETHEREUM_RPC_URL, ...RPC_URLS].filter(Boolean);

// Server-side JSON-RPC request. Sends an Origin header so origin-allowlisted
// keys accept calls from our API routes (server fetches carry none by
// default; Node's fetch allows setting it, unlike browsers).
export const rpcRequest = async (rpcUrl, method, params) => {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://nftjukebox.app",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    // A hanging RPC must fail fast so the fallback list gets its turn
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message || "RPC error");
  }
  return json.result;
};

// Batched JSON-RPC: several calls in a single HTTP round trip.
// calls: [{ method, params }] — results returned in the same order.
export const rpcBatchRequest = async (rpcUrl, calls) => {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://nftjukebox.app",
    },
    body: JSON.stringify(
      calls.map((call, id) => ({ jsonrpc: "2.0", id, ...call }))
    ),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json();
  if (!Array.isArray(json)) {
    throw new Error(json?.error?.message || "Batch not supported");
  }
  return calls.map((_, id) => {
    const entry = json.find((item) => item.id === id);
    if (!entry || entry.error) {
      throw new Error(entry?.error?.message || "RPC error");
    }
    return entry.result;
  });
};

const MAINNET = { name: "homestead", chainId: 1 };

let readProvider = null;

// Read-only provider: the user's wallet when available, otherwise a
// fallback across public RPCs so one dead endpoint can't blank the site.
export const getReadProvider = () => {
  if (!readProvider) {
    const injected = typeof window !== "undefined" ? window.ethereum : null;
    // Only trust the wallet for reads while it's on mainnet — on any other
    // chain every eth_call would silently query the wrong network.
    const onMainnet = !injected?.chainId || injected.chainId === "0x1";
    if (injected && onMainnet) {
      readProvider = new ethers.providers.Web3Provider(injected);
    } else {
      readProvider = new ethers.providers.FallbackProvider(
        RPC_URLS.map((url, index) => ({
          provider: new ethers.providers.StaticJsonRpcProvider(url, MAINNET),
          priority: index + 1,
          weight: 1,
          stallTimeout: 2500,
        })),
        1 // quorum of one: first healthy answer wins
      );
    }
  }
  return readProvider;
};

let playsPromise = null;

const fetchPlays = (url) => {
  const promise = (async () => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Plays fetch failed");
    return await response.json();
  })();
  promise.catch(() => {
    playsPromise = null; // allow a retry on failure
  });
  return promise;
};

// Every play ever, oldest first: { player, nftContract, tokenId, startBlock }.
// Served by /api/plays from the server-side stage cache.
export const getPlays = () => {
  if (!playsPromise) {
    playsPromise = fetchPlays("/api/plays");
  }
  return playsPromise;
};

// Refetch after a stage change, bypassing the CDN so the just-finished
// piece is guaranteed to be in the list.
export const refreshPlays = () => {
  playsPromise = fetchPlays("/api/plays?fresh=1");
  return playsPromise;
};

// Free public gateways, in order of preference. cloudflare-ipfs.com no
// longer exists; these are the maintained ones.
const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
];

const AR_GATEWAY = "https://arweave.net/";

// Ordered candidate HTTP URLs for a metadata/media URI. IPFS content gets
// one URL per gateway; a URL already pointing at some IPFS gateway keeps
// the original first and adds our gateway list as fallbacks.
export const httpCandidates = (uri) => {
  if (uri.startsWith("ipfs://")) {
    const path = uri.replace(/^ipfs:\/\/(ipfs\/)?/, "");
    return IPFS_GATEWAYS.map((gateway) => gateway + path);
  }
  if (uri.startsWith("ar://")) {
    return [AR_GATEWAY + uri.slice("ar://".length)];
  }
  const gatewayMatch = uri.match(/^https?:\/\/[^/]+\/ipfs\/(.+)$/i);
  if (gatewayMatch) {
    const alternates = IPFS_GATEWAYS.map(
      (gateway) => gateway + gatewayMatch[1]
    ).filter((candidate) => candidate !== uri);
    return [uri, ...alternates];
  }
  return [uri];
};

export const wrapWithProxy = (httpUrl) =>
  "/api/proxy?url=" + encodeURIComponent(httpUrl);

// Compressed WebP rendition via the sharp endpoint. The server caches the
// result (in-process LRU + CDN) and falls back to the plain proxy for
// anything it can't compress.
export const thumbUrl = (uri, width = 512) => {
  if (uri.startsWith("data:")) return uri;
  return (
    "/api/thumb?url=" +
    encodeURIComponent(httpCandidates(uri)[0]) +
    "&w=" +
    width
  );
};

// On the server we fetch targets directly (we ARE the proxy); in the
// browser everything goes through /api/proxy.
const probeUrl = (candidate) =>
  typeof window === "undefined" ? candidate : wrapWithProxy(candidate);

// Fetch JSON from a URI, walking the gateway candidates until one responds.
export const fetchJson = async (uri) => {
  let lastError = null;
  for (const candidate of httpCandidates(uri)) {
    try {
      // A stalling gateway shouldn't block when alternates exist
      const response = await fetch(probeUrl(candidate), {
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Fetch failed");
};

/* ---------------- Media resolution (used on client and server) ---------- */

// IPFS gateways frequently report application/octet-stream, so the file
// extension is often the more trustworthy signal.
const EXTENSION_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/mp4",
  ogv: "video/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  aac: "audio/aac",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  html: "text/html",
  htm: "text/html",
  pdf: "application/pdf",
};

const guessMimeFromUrl = (url) => {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const dot = pathname.lastIndexOf(".");
    if (dot === -1) return null;
    return EXTENSION_MIME[pathname.slice(dot + 1)] || null;
  } catch (_) {
    return null;
  }
};

// Reject anything that isn't a real content URI (e.g. javascript: URLs
// smuggled into metadata).
const ALLOWED_URI = /^(data:|ipfs:\/\/|ar:\/\/|https?:\/\/)/i;

// Media the browser parses without executing code — safe to show unprompted.
export const isSafeType = (type) =>
  ["image/", "video/", "audio/", "model/"].some((prefix) =>
    type.startsWith(prefix)
  );

// Resolve a metadata URI to { url, type, origin? }, or null if it can't be
// trusted. The returned url is what the browser should render (proxied,
// except HTML which needs its real origin for relative assets).
export const resolveMedia = async (uri) => {
  if (typeof uri !== "string" || !ALLOWED_URI.test(uri.trim())) {
    return null;
  }
  uri = uri.trim();

  if (uri.startsWith("data:")) {
    const mimeType = (uri.match(/^data:([^;,]*)/)?.[1] || "text/plain")
      .trim()
      .toLowerCase();

    const commaIndex = uri.indexOf(",");
    const beforeComma = uri.substring(0, commaIndex);
    const afterComma = uri.substring(commaIndex + 1);

    const src = /;base64,/i.test(beforeComma + ",")
      ? uri
      : beforeComma + "," + encodeURIComponent(afterComma);

    return { url: src, type: mimeType };
  }

  // Probe the gateway candidates until one answers; the responding
  // gateway is the one we render from.
  const candidates = httpCandidates(uri);
  let chosenUrl = null;
  let mimeType = null;

  for (const candidate of candidates) {
    try {
      const response = await fetch(probeUrl(candidate), {
        method: "HEAD",
        signal: AbortSignal.timeout(6_000),
      });
      if (response.ok) {
        chosenUrl = candidate;
        mimeType = (response.headers.get("Content-Type") || "")
          .split(";")[0]
          .trim()
          .toLowerCase();
        break;
      }
    } catch (_) {
      /* try the next gateway */
    }
  }

  if (!chosenUrl) chosenUrl = candidates[0];

  if (!mimeType || mimeType.endsWith("/octet-stream")) {
    // Assume interactive HTML if nothing else fits — most generative
    // pieces are extensionless HTML pages behind a gateway.
    mimeType = guessMimeFromUrl(chosenUrl) || mimeType || "text/html";
  }

  // HTML must keep its real origin so its relative scripts/assets resolve;
  // everything else goes through the proxy for CORS + mixed-content safety.
  return {
    url: mimeType === "text/html" ? chosenUrl : wrapWithProxy(chosenUrl),
    type: mimeType,
    origin: chosenUrl,
  };
};

// Resolve the still + animation pair from a metadata object.
export const resolveMediaPair = async (metadata) => {
  let staticUri = null;
  if (metadata.image) {
    staticUri = metadata.image;
  } else if (metadata.image_data) {
    // image_data is usually raw SVG markup rather than a URI
    const svg = String(metadata.image_data).trim();
    staticUri = svg.startsWith("<")
      ? "data:image/svg+xml;utf8," + svg
      : svg;
  }

  const [staticMedia, animMedia] = await Promise.all([
    staticUri ? resolveMedia(staticUri) : Promise.resolve(null),
    metadata.animation_url
      ? resolveMedia(metadata.animation_url)
      : Promise.resolve(null),
  ]);

  return { staticMedia, animMedia };
};

const displayCache = new Map();

// Resolve { name, image } for an NFT, for archive thumbnails. The heavy
// lifting (tokenURI call + metadata fetch) happens once server-side and is
// CDN-cached long-term; the browser makes one cheap GET per token.
export const getNftDisplay = (nftContract, tokenId) => {
  const key = `${nftContract}:${tokenId}`;
  if (displayCache.has(key)) return displayCache.get(key);

  const promise = (async () => {
    const response = await fetch(
      `/api/nft-display?contract=${nftContract}&id=${tokenId}`
    );
    if (!response.ok) throw new Error("display fetch failed");
    return await response.json();
  })();

  displayCache.set(key, promise);
  promise.catch(() => displayCache.delete(key));
  return promise;
};
