import { ethers } from "ethers";
import {
  JUKE_TOKEN,
  serverRpcUrls,
  rpcRequest,
  rpcBatchRequest,
  fetchJson,
  resolveMediaPair,
} from "@/lib/jukebox";

// Single server-side source of truth for everything the frontend shows:
// the piece currently on stage (with resolved media) plus the full play
// history. Built from chain once, then kept fresh with one cheap
// startBlock() probe at most every CHECK_INTERVAL_MS — no matter how many
// visitors are hitting the API routes. A full rebuild (metadata fetch,
// media resolution, incremental log append) only runs when the probe says
// the stage actually changed hands.

const DEPLOY_BLOCK = 18661907;
const CHECK_INTERVAL_MS = 4_000;
// A just-confirmed play (fresh=1) may bypass the normal gate, but still at
// most once per second so the endpoint can't be abused into an RPC firehose.
const FRESH_INTERVAL_MS = 1_000;

const jukeInterface = new ethers.utils.Interface([
  "function nowPlaying() view returns (string)",
  "function nftContract() view returns (address)",
  "function tokenId() view returns (uint256)",
  "function startBlock() view returns (uint256)",
  "function player() view returns (address)",
  "event NFTPlayed(address indexed player, address indexed nftContract, uint256 indexed tokenId, uint256 startBlock)",
]);
const PLAY_TOPIC = jukeInterface.getEventTopic("NFTPlayed");

let state = null; // { checkedAt, currentBlock, nowPlaying, plays }
let building = null; // in-flight refresh promise (stampede guard)

async function withRpcs(fn) {
  let lastError = null;
  for (const rpc of serverRpcUrls()) {
    try {
      return await fn(rpc);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("All RPCs failed");
}

const ethCall = (fnName, params = [], to = JUKE_TOKEN, iface = jukeInterface) =>
  withRpcs(async (rpc) => {
    const result = await rpcRequest(rpc, "eth_call", [
      { to, data: iface.encodeFunctionData(fnName, params) },
      "latest",
    ]);
    return iface.decodeFunctionResult(fnName, result)[0];
  });

/* --------------------------- ENS reverse lookup -------------------------- */

const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const ensInterface = new ethers.utils.Interface([
  "function resolver(bytes32) view returns (address)",
  "function name(bytes32) view returns (string)",
  "function addr(bytes32) view returns (address)",
]);

// Reverse-resolve with forward verification (anyone can claim any reverse
// name, so we check the name actually points back at the address).
async function reverseEns(address) {
  try {
    const reverseNode = ethers.utils.namehash(
      address.slice(2).toLowerCase() + ".addr.reverse"
    );
    const reverseResolver = await ethCall(
      "resolver",
      [reverseNode],
      ENS_REGISTRY,
      ensInterface
    );
    if (!reverseResolver || reverseResolver === ethers.constants.AddressZero) {
      return null;
    }
    const name = await ethCall("name", [reverseNode], reverseResolver, ensInterface);
    if (!name) return null;

    const forwardNode = ethers.utils.namehash(name);
    const forwardResolver = await ethCall(
      "resolver",
      [forwardNode],
      ENS_REGISTRY,
      ensInterface
    );
    if (!forwardResolver || forwardResolver === ethers.constants.AddressZero) {
      return null;
    }
    const resolved = await ethCall("addr", [forwardNode], forwardResolver, ensInterface);
    return resolved?.toLowerCase() === address.toLowerCase() ? name : null;
  } catch (_) {
    return null;
  }
}

/* ------------------------------ Play history ----------------------------- */

const parseLogs = (logs) =>
  logs
    .map((log) => {
      const args = jukeInterface.parseLog({
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

const fetchLogsRpc = (fromBlock) =>
  withRpcs(async (rpc) => {
    const logs = await rpcRequest(rpc, "eth_getLogs", [
      {
        address: JUKE_TOKEN,
        fromBlock: "0x" + fromBlock.toString(16),
        toBlock: "latest",
        topics: [PLAY_TOPIC],
      },
    ]);
    return parseLogs(logs);
  });

// Blockscout's indexer serves the full history for free; free RPCs reject
// the ~5M-block range that the cold-start query needs.
async function fetchLogsBlockscout() {
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

// Cold start only. With a keyed endpoint the direct chain query comes
// first; otherwise Blockscout is the only free source for the full range.
async function fetchAllPlays() {
  const order = process.env.ETHEREUM_RPC_URL
    ? [() => fetchLogsRpc(DEPLOY_BLOCK), fetchLogsBlockscout]
    : [fetchLogsBlockscout, () => fetchLogsRpc(DEPLOY_BLOCK)];
  try {
    return await order[0]();
  } catch (_) {
    return await order[1]();
  }
}

/* --------------------------------- Rebuild ------------------------------- */

const timed = async (label, promise, timings) => {
  const start = Date.now();
  try {
    return await promise;
  } finally {
    timings.push(`${label} ${Date.now() - start}ms`);
  }
};

const CORE_FNS = ["nowPlaying", "nftContract", "tokenId", "startBlock", "player"];

// All contract state + block number in one batched round trip.
const fetchCore = () =>
  withRpcs(async (rpc) => {
    const results = await rpcBatchRequest(rpc, [
      ...CORE_FNS.map((fn) => ({
        method: "eth_call",
        params: [
          { to: JUKE_TOKEN, data: jukeInterface.encodeFunctionData(fn) },
          "latest",
        ],
      })),
      { method: "eth_blockNumber", params: [] },
    ]);
    const decoded = CORE_FNS.map(
      (fn, i) => jukeInterface.decodeFunctionResult(fn, results[i])[0]
    );
    return [...decoded, parseInt(results[CORE_FNS.length], 16)];
  });

async function rebuild() {
  const timings = [];
  const [tokenURI, nftContract, tokenId, startBlock, player, currentBlock] =
    await timed("core", fetchCore(), timings);

  const resolvePiece = async () => {
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
    const media =
      metadata && typeof metadata === "object"
        ? await resolveMediaPair(metadata)
        : { staticMedia: null, animMedia: null };
    return { metadata, ...media };
  };

  // Play history: append just the new logs (a tiny block range any RPC
  // accepts); the full multi-million-block query only runs cold.
  const resolvePlays = async () => {
    if (state?.plays?.length) {
      const lastKnown = state.plays[state.plays.length - 1].startBlock;
      const fresh = await fetchLogsRpc(lastKnown + 1);
      return [
        ...state.plays,
        ...fresh.filter((play) => play.startBlock > lastKnown),
      ];
    }
    return fetchAllPlays();
  };

  // The three network-bound chains are independent — run them concurrently
  // to keep the cold build well under serverless time limits.
  const [{ metadata, staticMedia, animMedia }, plays] = await Promise.all([
    timed("piece", resolvePiece(), timings),
    timed("plays", resolvePlays(), timings),
  ]);

  console.log("stage rebuild:", timings.join(", "));

  state = {
    checkedAt: Date.now(),
    currentBlock,
    plays,
    nowPlaying: {
      name: metadata?.name || null,
      nftContract,
      tokenId: tokenId.toString(),
      startBlock: startBlock.toNumber(),
      player,
      playerAddress: player,
      staticMedia,
      animMedia,
    },
  };

  // ENS is display sugar — resolve it off the critical path and patch the
  // cached state when it lands; the next snapshot poll picks it up.
  reverseEns(player)
    .then((ens) => {
      if (ens && state?.nowPlaying?.playerAddress === player) {
        state.nowPlaying.player = ens;
      }
    })
    .catch(() => {});
}

/* ------------------------------- Public API ------------------------------ */

export async function getStageState({ fresh = false } = {}) {
  const now = Date.now();

  const gate = fresh ? FRESH_INTERVAL_MS : CHECK_INTERVAL_MS;
  if (state && now - state.checkedAt < gate && !building) return state;

  if (!building) {
    if (state) state.checkedAt = now; // even a failed probe waits 4s to retry
    building = (async () => {
      try {
        if (state) {
          // One batched round trip: "did the stage change?" + block height
          const [probeResult, blockHex] = await withRpcs((rpc) =>
            rpcBatchRequest(rpc, [
              {
                method: "eth_call",
                params: [
                  {
                    to: JUKE_TOKEN,
                    data: jukeInterface.encodeFunctionData("startBlock"),
                  },
                  "latest",
                ],
              },
              { method: "eth_blockNumber", params: [] },
            ])
          );
          state.currentBlock = parseInt(blockHex, 16);
          const probe = jukeInterface
            .decodeFunctionResult("startBlock", probeResult)[0]
            .toNumber();
          if (probe === state.nowPlaying.startBlock) {
            return state; // unchanged — cache stays valid
          }
        }
        await rebuild();
        return state;
      } finally {
        building = null;
      }
    })();
  }

  // A fresh request waits for the probe/rebuild so the caller gets the
  // post-transaction reality, not the pre-transaction cache.
  if (fresh) {
    try {
      return await building;
    } catch (error) {
      if (state) return state;
      throw error;
    }
  }

  // With a warm cache, serve it immediately while the probe/rebuild runs in
  // the background; cold visitors wait for the first build.
  if (state) {
    building.catch(() => {});
    return state;
  }
  return building;
}
