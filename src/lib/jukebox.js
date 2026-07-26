import { ethers } from "ethers";

export const JUKE_TOKEN = "0xEb01299cd6C93E1030280234E4Cd62E2fe7F8ad4";

const RPC_URL = "https://mainnet.infura.io/v3/bc8d2aba81be4f1b9d33bf7af8989a3c";

let readProvider = null;

// Read-only provider: the user's wallet when available, public RPC otherwise.
export const getReadProvider = () => {
  if (!readProvider) {
    readProvider =
      typeof window !== "undefined" && window.ethereum
        ? new ethers.providers.Web3Provider(window.ethereum)
        : new ethers.providers.JsonRpcProvider(RPC_URL);
  }
  return readProvider;
};

const PLAY_EVENT_ABI =
  "event NFTPlayed(address indexed player, address indexed nftContract, uint256 indexed tokenId, uint256 startBlock)";
const playInterface = new ethers.utils.Interface([PLAY_EVENT_ABI]);

let playsPromise = null;

// Every play ever, oldest first: { player, nftContract, tokenId, startBlock }.
// Fetched once per page load and shared by all consumers.
export const getPlays = () => {
  if (!playsPromise) {
    playsPromise = (async () => {
      const logs = await getReadProvider().getLogs({
        address: JUKE_TOKEN,
        fromBlock: 0,
        toBlock: "latest",
        topics: [playInterface.getEventTopic("NFTPlayed")],
      });
      return logs.map((log) => {
        const args = playInterface.parseLog(log).args;
        return {
          player: args.player,
          nftContract: args.nftContract,
          tokenId: args.tokenId.toString(),
          startBlock: args.startBlock.toNumber(),
        };
      });
    })();
    playsPromise.catch(() => {
      playsPromise = null; // allow a retry on failure
    });
  }
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

// Fetch JSON from a URI, walking the gateway candidates until one responds.
export const fetchJson = async (uri) => {
  let lastError = null;
  for (const candidate of httpCandidates(uri)) {
    try {
      const response = await fetch(wrapWithProxy(candidate));
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Fetch failed");
};

const displayCache = new Map();

// Resolve { name, image } for an NFT, for archive thumbnails. Cached per token.
export const getNftDisplay = (nftContract, tokenId) => {
  const key = `${nftContract}:${tokenId}`;
  if (displayCache.has(key)) return displayCache.get(key);

  const promise = (async () => {
    const provider = getReadProvider();
    let uri;
    try {
      uri = await new ethers.Contract(
        nftContract,
        ["function tokenURI(uint256) view returns (string)"],
        provider
      ).tokenURI(tokenId);
    } catch (_) {
      uri = await new ethers.Contract(
        nftContract,
        ["function uri(uint256) view returns (string)"],
        provider
      ).uri(tokenId);
    }

    let metadata;
    if (uri.startsWith("data:")) {
      const commaIndex = uri.indexOf(",");
      const body = uri.substring(commaIndex + 1);
      const isBase64 = /;base64,/i.test(uri.substring(0, commaIndex + 1));
      metadata = JSON.parse(isBase64 ? atob(body) : decodeURIComponent(body));
    } else {
      metadata = await fetchJson(uri);
    }

    const asThumbUrl = (mediaUri) =>
      mediaUri.startsWith("data:")
        ? mediaUri
        : wrapWithProxy(httpCandidates(mediaUri)[0]);

    let image = null;
    if (metadata.image) {
      image = asThumbUrl(metadata.image);
    } else if (metadata.image_data) {
      image =
        "data:image/svg+xml;utf8," + encodeURIComponent(metadata.image_data);
    } else if (
      metadata.animation_url &&
      /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(metadata.animation_url)
    ) {
      image = asThumbUrl(metadata.animation_url);
    }

    return { name: metadata.name || "Untitled", image };
  })();

  displayCache.set(key, promise);
  promise.catch(() => displayCache.delete(key));
  return promise;
};
