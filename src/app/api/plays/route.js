import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { JUKE_TOKEN, RPC_URLS } from "@/lib/jukebox";

export const dynamic = "force-dynamic";

const DEPLOY_BLOCK = 18661907;

const playInterface = new ethers.utils.Interface([
  "event NFTPlayed(address indexed player, address indexed nftContract, uint256 indexed tokenId, uint256 startBlock)",
]);
const PLAY_TOPIC = playInterface.getEventTopic("NFTPlayed");

const TTL_MS = 60_000;
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

// Last resort: try the raw log query on each RPC (most free ones refuse
// the range, but a healthy paid/archival endpoint in the list would work).
async function fromRpc() {
  let lastError = null;
  for (const rpc of RPC_URLS) {
    try {
      const response = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getLogs",
          params: [
            {
              address: JUKE_TOKEN,
              fromBlock: "0x" + DEPLOY_BLOCK.toString(16),
              toBlock: "latest",
              topics: [PLAY_TOPIC],
            },
          ],
        }),
        cache: "no-store",
      });
      const json = await response.json();
      if (json.error) throw new Error(json.error.message);
      return parseLogs(json.result);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("All RPCs failed");
}

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return respond(cache.data);
  }

  try {
    let data;
    try {
      data = await fromBlockscout();
    } catch (_) {
      data = await fromRpc();
    }
    cache = { at: Date.now(), data };
    return respond(data);
  } catch (error) {
    console.error("plays fetch failed:", error);
    if (cache) return respond(cache.data); // stale beats nothing
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
