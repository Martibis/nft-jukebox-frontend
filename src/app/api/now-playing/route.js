import { NextResponse } from "next/server";
import { ethers } from "ethers";
import {
  JUKE_TOKEN,
  serverRpcUrls,
  rpcRequest,
  fetchJson,
  resolveMediaPair,
} from "@/lib/jukebox";

export const dynamic = "force-dynamic";

// ethers' JsonRpcProvider doesn't survive Next's server bundling (its HTTP
// transport breaks with "could not detect network"), so we make the eth_call
// requests with plain fetch and only use ethers' pure-JS ABI coder.
const contractInterface = new ethers.utils.Interface([
  "function nowPlaying() view returns (string)",
  "function nftContract() view returns (address)",
  "function tokenId() view returns (uint256)",
  "function startBlock() view returns (uint256)",
  "function player() view returns (address)",
]);

async function ethCall(fn) {
  let lastError = null;
  for (const rpc of serverRpcUrls()) {
    try {
      const result = await rpcRequest(rpc, "eth_call", [
        { to: JUKE_TOKEN, data: contractInterface.encodeFunctionData(fn) },
        "latest",
      ]);
      return contractInterface.decodeFunctionResult(fn, result)[0];
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("All RPCs failed");
}

// Snapshot of the piece currently on stage, so every visitor (including
// first-timers) can paint the artwork before a single RPC call resolves.
// One in-memory copy per instance + CDN caching via the headers below.
const TTL_MS = 12_000; // ~one block
let snapshot = null; // { at, data }

const respond = (data) =>
  NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=12, stale-while-revalidate=300",
    },
  });

export async function GET() {
  if (snapshot && Date.now() - snapshot.at < TTL_MS) {
    return respond(snapshot.data);
  }

  try {
    const [tokenURI, nftContract, tokenId, startBlock, player] =
      await Promise.all([
        ethCall("nowPlaying"),
        ethCall("nftContract"),
        ethCall("tokenId"),
        ethCall("startBlock"),
        ethCall("player"),
      ]);

    let metadata = null;
    try {
      if (tokenURI.startsWith("data:")) {
        const commaIndex = tokenURI.indexOf(",");
        const body = tokenURI.substring(commaIndex + 1);
        const isBase64 = /;base64,/i.test(
          tokenURI.substring(0, commaIndex + 1)
        );
        metadata = JSON.parse(isBase64 ? atob(body) : decodeURIComponent(body));
      } else {
        metadata = await fetchJson(tokenURI);
      }
    } catch (_) {
      metadata = null;
    }

    const { staticMedia, animMedia } =
      metadata && typeof metadata === "object"
        ? await resolveMediaPair(metadata)
        : { staticMedia: null, animMedia: null };

    const data = {
      name: metadata?.name || null,
      nftContract,
      tokenId: tokenId.toString(),
      startBlock: startBlock.toNumber(),
      player,
      staticMedia,
      animMedia,
    };

    snapshot = { at: Date.now(), data };
    return respond(data);
  } catch (error) {
    console.error("now-playing snapshot failed:", error);
    // Serve the stale snapshot rather than nothing
    if (snapshot) return respond(snapshot.data);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
