import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { serverRpcUrls, rpcRequest, fetchJson, thumbUrl } from "@/lib/jukebox";

export const dynamic = "force-dynamic";

// Display data ({ name, image }) for one NFT, resolved server-side so the
// archive never needs chain calls in the browser. A past play's metadata is
// effectively immutable, hence the long CDN cache + in-memory LRU.

const nftInterface = new ethers.utils.Interface([
  "function tokenURI(uint256) view returns (string)",
  "function uri(uint256) view returns (string)",
]);

const CACHE_MAX = 500;
const cache = new Map(); // "contract:id" -> { name, image }

const respond = (data) =>
  NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });

// tokenURI (ERC-721) first, uri (ERC-1155) as fallback, each walking the
// RPC list. Reverts fail fast, so the nested loops stay cheap.
async function fetchTokenUri(contract, tokenId) {
  let lastError = null;
  for (const fn of ["tokenURI", "uri"]) {
    for (const rpc of serverRpcUrls()) {
      try {
        const result = await rpcRequest(rpc, "eth_call", [
          {
            to: contract,
            data: nftInterface.encodeFunctionData(fn, [tokenId]),
          },
          "latest",
        ]);
        return nftInterface.decodeFunctionResult(fn, result)[0];
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError || new Error("token URI unavailable");
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const contract = (searchParams.get("contract") || "").toLowerCase();
  const tokenId = searchParams.get("id") || "";
  if (!/^0x[0-9a-f]{40}$/.test(contract) || !/^\d+$/.test(tokenId)) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }

  const key = `${contract}:${tokenId}`;
  if (cache.has(key)) return respond(cache.get(key));

  try {
    const uri = await fetchTokenUri(contract, tokenId);

    let metadata;
    if (uri.startsWith("data:")) {
      const commaIndex = uri.indexOf(",");
      const body = uri.substring(commaIndex + 1);
      const isBase64 = /;base64,/i.test(uri.substring(0, commaIndex + 1));
      metadata = JSON.parse(isBase64 ? atob(body) : decodeURIComponent(body));
    } else {
      metadata = await fetchJson(uri);
    }

    let image = null;
    if (metadata.image) {
      image = thumbUrl(metadata.image, 512);
    } else if (metadata.image_data) {
      image =
        "data:image/svg+xml;utf8," + encodeURIComponent(metadata.image_data);
    } else if (
      metadata.animation_url &&
      /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(metadata.animation_url)
    ) {
      image = thumbUrl(metadata.animation_url, 512);
    }

    const data = { name: metadata.name || "Untitled", image };

    cache.set(key, data);
    if (cache.size > CACHE_MAX) {
      cache.delete(cache.keys().next().value); // evict oldest insertion
    }
    return respond(data);
  } catch (error) {
    console.error("nft-display failed for", key, error);
    return NextResponse.json(
      { error: "unavailable" },
      // Brief CDN cache so a flaky token can't hammer the RPCs
      { status: 404, headers: { "Cache-Control": "public, s-maxage=300" } }
    );
  }
}
