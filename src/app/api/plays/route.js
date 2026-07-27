import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { JUKE_TOKEN, serverRpcUrls, rpcRequest } from "@/lib/jukebox";

export const dynamic = "force-dynamic";

const DEPLOY_BLOCK = 18661907;

const playInterface = new ethers.utils.Interface([
  "event NFTPlayed(address indexed player, address indexed nftContract, uint256 indexed tokenId, uint256 startBlock)",
  "function startBlock() view returns (uint256)",
]);
const PLAY_TOPIC = playInterface.getEventTopic("NFTPlayed");

const SOFT_TTL_MS = 30_000;
let cache = null; // { at, data }

const respond = (data) =>
  NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600",
    },
  });

const parseLogs = (logs) =>
  logs
    .map((log) => {
      const args = playInterface.parseLog({
        topics: log.topics,
        data: log.data,
      }).args;
      return {
        player: args.player,
        nftContract: args.nftContract,
        tokenId: args.tokenId.toString(),
        startBlock: args.startBlock.toNumber(),
      };
    })
    .sort((a, b) => a.startBlock - b.startBlock);

// Blockscout's indexer serves the full history for free; raw eth_getLogs
// over ~5M blocks is rejected by every free RPC.
async function fromBlockscout() {
  const url =
    "https://eth.blockscout.com/api?module=logs&action=getLogs" +
    `&fromBlock=${DEPLOY_BLOCK}&toBlock=latest` +
    `&address=${JUKE_TOKEN}&topic0=${PLAY_TOPIC}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("HTTP " + response.status);
  const json = await response.json();
  if (json.message === "No records found") return [];
  if (!Array.isArray(json.result)) {
    throw new Error("Blockscout error: " + json.message);
  }
  return parseLogs(json.result);
}

// Raw log query over the full range. Free public RPCs refuse it, but a
// keyed endpoint (ETHEREUM_RPC_URL) handles it fine.
async function fromRpc() {
  let lastError = null;
  for (const rpc of serverRpcUrls()) {
    try {
      const logs = await rpcRequest(rpc, "eth_getLogs", [
        {
          address: JUKE_TOKEN,
          fromBlock: "0x" + DEPLOY_BLOCK.toString(16),
          toBlock: "latest",
          topics: [PLAY_TOPIC],
        },
      ]);
      return parseLogs(logs);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("All RPCs failed");
}

async function fetchPlays() {
  // With a keyed endpoint configured, query the chain directly and keep
  // Blockscout as backup; without one, Blockscout is the only source that
  // serves the full history for free.
  const order = process.env.ETHEREUM_RPC_URL
    ? [fromRpc, fromBlockscout]
    : [fromBlockscout, fromRpc];
  try {
    return await order[0]();
  } catch (_) {
    return await order[1]();
  }
}

// One cheap eth_call to the contract's startBlock(): if it still matches the
// latest cached play, no new play has happened and the cache stays valid.
async function currentStartBlock() {
  let lastError = null;
  for (const rpc of serverRpcUrls()) {
    try {
      const result = await rpcRequest(rpc, "eth_call", [
        { to: JUKE_TOKEN, data: playInterface.encodeFunctionData("startBlock") },
        "latest",
      ]);
      return playInterface
        .decodeFunctionResult("startBlock", result)[0]
        .toNumber();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("All RPCs failed");
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < SOFT_TTL_MS) {
    return respond(cache.data);
  }

  // Conditional invalidation: only re-run the full log query when the
  // on-chain state actually changed.
  if (cache && cache.data.length) {
    try {
      const latest = cache.data[cache.data.length - 1].startBlock;
      if ((await currentStartBlock()) === latest) {
        cache.at = now;
        return respond(cache.data);
      }
    } catch (_) {
      // fall through to a full refresh
    }
  }

  try {
    const data = await fetchPlays();
    cache = { at: now, data };
    return respond(data);
  } catch (error) {
    console.error("plays fetch failed:", error);
    if (cache) return respond(cache.data); // stale beats nothing
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
