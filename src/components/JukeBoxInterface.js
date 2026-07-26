import React, { useEffect, useRef, useState } from "react";

import { ethers } from "ethers";
import JukeBoxTokenABI from "../data/JukeBoxToken.json";
import NftABI from "../data/Nft.json";
import ModelViewer from "./ModelViewer";
import { httpCandidates, wrapWithProxy, fetchJson } from "@/lib/jukebox";

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
const isSafeType = (type) =>
  ["image/", "video/", "audio/", "model/"].some((prefix) =>
    type.startsWith(prefix)
  );

const animationLabel = (type) => {
  if (type.startsWith("video/")) return "Play video";
  if (type.startsWith("audio/")) return "Play audio";
  if (type.startsWith("model/")) return "View in 3D";
  return "Run interactive piece";
};

const JukeBoxInterface = ({ autoRefresh = false }) => {
  const contractAddress = "0xEb01299cd6C93E1030280234E4Cd62E2fe7F8ad4";
  const startBlockRef = useRef(0);
  const [staticMedia, setStaticMedia] = useState(null); // { url, type }
  const [animMedia, setAnimMedia] = useState(null); // { url, type }
  const [showAnim, setShowAnim] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [name, setName] = useState("");
  const [nftContract, setNftContract] = useState("");
  const [player, setPlayer] = useState("");
  const [owner, setOwner] = useState("");
  const [startBlock, setStartBlock] = useState(0);
  const [currentBlock, setCurrentBlock] = useState(0);
  const [tokenId, setTokenId] = useState(0);

  const publishNowPlaying = (update) => {
    try {
      window.dispatchEvent(new CustomEvent("now-playing", { detail: update }));
    } catch (_) {
      /* no-op */
    }
  };

  function isData(str) {
    const dataRegex = /^data:(.*)$/;
    return dataRegex.test(str);
  }

  function isBase64(str) {
    const base64Regex = /^data:(.*?);base64,(.*)$/;
    return base64Regex.test(str);
  }

  const increaseCurrentBlock = () => {
    setCurrentBlock((prevBlock) => prevBlock + 1);
  };

  const fetchNowPlaying = async (contract) => {
    let provider;

    if (typeof window.ethereum !== "undefined") {
      // If window.ethereum is available, use Web3Provider
      provider = new ethers.providers.Web3Provider(window.ethereum);
    } else {
      // If window.ethereum is not available, use Infura
      provider = new ethers.providers.JsonRpcProvider(
        "https://mainnet.infura.io/v3/bc8d2aba81be4f1b9d33bf7af8989a3c"
      );
    }

    const tokenURI = await contract.nowPlaying();
    const nftContract = await contract.nftContract();
    const tokenId = await contract.tokenId();
    const startBlock = await contract.startBlock();
    let currentBlock = await provider.getBlockNumber();
    console.log(currentBlock);
    setCurrentBlock(currentBlock);
    setStartBlock(startBlock);
    setNftContract(nftContract);
    setTokenId(tokenId);

    // Publish chain-level facts immediately so the placard never hangs on a
    // slow or broken metadata fetch.
    const startBlockNumber =
      typeof startBlock?.toNumber === "function"
        ? startBlock.toNumber()
        : Number(startBlock);
    startBlockRef.current = startBlockNumber;

    const tokenIdStr = tokenId?.toString ? tokenId.toString() : String(tokenId);
    const fallbackName =
      "Token #" +
      (tokenIdStr.length > 10 ? tokenIdStr.slice(0, 6) + "…" : tokenIdStr);

    publishNowPlaying({
      nftContract,
      tokenId: tokenIdStr,
      startBlock: startBlockNumber,
      currentBlock,
    });

    // ERC-721 only — ERC-1155 has no ownerOf, and ENS lookups can fail too
    try {
      const nftContractConnected = new ethers.Contract(
        nftContract,
        NftABI,
        provider
      );
      const owner = await nftContractConnected.ownerOf(tokenId);
      const potentialEns = await provider.lookupAddress(owner);
      setOwner(potentialEns || owner);
    } catch (_) {
      setOwner("");
    }

    setMediaFailed(false);

    let metadata = null;

    try {
      if (isData(tokenURI)) {
        const commaIndex = tokenURI.indexOf(",");
        const afterComma = tokenURI.substring(commaIndex + 1);

        const decoded = isBase64(tokenURI) ? atob(afterComma) : afterComma;

        metadata = JSON.parse(decoded);
      } else {
        // Walks all configured IPFS gateways before giving up
        metadata = await fetchJson(tokenURI);
      }
    } catch (error) {
      console.error("Error fetching token metadata:", error);
    }

    if (!metadata || typeof metadata !== "object") {
      setStaticMedia(null);
      setAnimMedia(null);
      setShowAnim(false);
      setMediaFailed(true);
      setName(fallbackName);
      publishNowPlaying({ name: fallbackName });
      return;
    }

    setName(metadata.name || fallbackName);

    // The still image is always the default view; the animation (video,
    // audio, HTML, 3D…) is offered as an explicit option on top of it.
    setShowAnim(false);

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

    const [staticM, animM] = await Promise.all([
      staticUri ? resolveMedia(staticUri) : Promise.resolve(null),
      metadata.animation_url
        ? resolveMedia(metadata.animation_url)
        : Promise.resolve(null),
    ]);

    setStaticMedia(staticM);
    setAnimMedia(animM);

    // Metadata resolved but nothing renderable in it
    if (!staticM && !animM) {
      setMediaFailed(true);
    }

    // No still to fall back on: show the animation directly, but only if
    // it's a media type that can't execute code. HTML stays behind a click.
    if (!staticM && animM && isSafeType(animM.type)) {
      setShowAnim(true);
    }

    publishNowPlaying({ name: metadata.name || fallbackName });
  };

  const fetchPlayer = async (contract) => {
    let provider;

    if (typeof window.ethereum !== "undefined") {
      // If window.ethereum is available, use Web3Provider
      provider = new ethers.providers.Web3Provider(window.ethereum);
    } else {
      // If window.ethereum is not available, use Infura
      provider = new ethers.providers.JsonRpcProvider(
        "https://mainnet.infura.io/v3/bc8d2aba81be4f1b9d33bf7af8989a3c"
      );
    }

    const player = await contract.player();

    let potentialEns = await provider.lookupAddress(player);

    if (potentialEns) {
      setPlayer(potentialEns);
    } else {
      setPlayer(player);
    }

    publishNowPlaying({ player: potentialEns || player });
  };

  // Resolve a metadata URI to { url, type }, or null if it can't be trusted.
  const resolveMedia = async (uri) => {
    if (typeof uri !== "string" || !ALLOWED_URI.test(uri.trim())) {
      return null;
    }
    uri = uri.trim();

    if (isData(uri)) {
      const mimeType = (uri.match(/^data:([^;,]*)/)?.[1] || "text/plain")
        .trim()
        .toLowerCase();

      const commaIndex = uri.indexOf(",");
      const beforeComma = uri.substring(0, commaIndex);
      const afterComma = uri.substring(commaIndex + 1);

      const src = isBase64(uri)
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
        const response = await fetch(wrapWithProxy(candidate), {
          method: "HEAD",
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
    };
  };

  const stillUrl =
    staticMedia && staticMedia.type.startsWith("image/")
      ? staticMedia.url
      : "";

  const renderContent = (media) => {
    const kind = media.type;

    if (kind.startsWith("image/")) {
      return (
        <img src={media.url} alt={name || "NFT artwork currently on view"} />
      );
    }

    if (kind.startsWith("video/")) {
      return (
        <video
          src={media.url}
          poster={stillUrl || undefined}
          autoPlay
          muted
          loop
          playsInline
          controls
        />
      );
    }

    if (kind.startsWith("audio/")) {
      return (
        <div className="audio-piece">
          {stillUrl ? (
            <img src={stillUrl} alt={name || "Cover art"} />
          ) : (
            <div className="audio-disc" aria-hidden="true" />
          )}
          <audio src={media.url} controls autoPlay preload="metadata" />
        </div>
      );
    }

    if (kind === "model/gltf-binary" || kind === "model/gltf+json") {
      return <ModelViewer src={media.url} alt={name} poster={stillUrl} />;
    }

    if (
      kind === "text/html" ||
      kind === "application/pdf" ||
      media.url.startsWith("data:")
    ) {
      // Only reached after an explicit click (or for a code-free data URI).
      // allow-scripts WITHOUT allow-same-origin: the piece runs in an opaque
      // origin and cannot touch our cookies, storage, wallet, or parent DOM.
      // No top-navigation / popups / modals / downloads either.
      return (
        <iframe
          src={media.url}
          sandbox="allow-scripts"
          allow="autoplay; xr-spatial-tracking"
          referrerPolicy="no-referrer"
          title={name || "NFT content"}
        />
      );
    }

    return (
      <p>
        <a
          href={`https://opensea.io/assets/ethereum/${nftContract}/${tokenId}`}
          target="_blank"
          rel="noreferrer"
        >
          View this piece on OpenSea ↗
        </a>
      </p>
    );
  };

  useEffect(() => {
    let provider;

    if (typeof window.ethereum !== "undefined") {
      // If window.ethereum is available, use Web3Provider
      provider = new ethers.providers.Web3Provider(window.ethereum);
    } else {
      // If window.ethereum is not available, use Infura
      provider = new ethers.providers.JsonRpcProvider(
        "https://mainnet.infura.io/v3/bc8d2aba81be4f1b9d33bf7af8989a3c"
      );
    }

    const contract = new ethers.Contract(
      contractAddress,
      JukeBoxTokenABI,
      provider
    );

    contract.on("NFTPlayed", async () => {
      await fetchNowPlaying(contract);
      await fetchPlayer(contract);
    });

    fetchNowPlaying(contract);
    fetchPlayer(contract);

    // Manual refresh, triggered from the stage toolbar
    const refresh = () => {
      fetchNowPlaying(contract);
      fetchPlayer(contract);
    };
    window.addEventListener("jukebox-refresh", refresh);

    return () => {
      contract.removeAllListeners("NFTPlayed");
      window.removeEventListener("jukebox-refresh", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-sync: once per block (~12s), cheaply check whether the stage changed
  // and only then do a full refetch.
  useEffect(() => {
    if (!autoRefresh) return;

    let provider;
    if (typeof window.ethereum !== "undefined") {
      provider = new ethers.providers.Web3Provider(window.ethereum);
    } else {
      provider = new ethers.providers.JsonRpcProvider(
        "https://mainnet.infura.io/v3/bc8d2aba81be4f1b9d33bf7af8989a3c"
      );
    }
    const contract = new ethers.Contract(
      contractAddress,
      JukeBoxTokenABI,
      provider
    );

    const intervalId = setInterval(async () => {
      try {
        const startBlock = await contract.startBlock();
        const startBlockNumber =
          typeof startBlock?.toNumber === "function"
            ? startBlock.toNumber()
            : Number(startBlock);
        if (startBlockNumber !== startBlockRef.current) {
          await fetchNowPlaying(contract);
          await fetchPlayer(contract);
        }
      } catch (_) {
        /* transient RPC error — try again next block */
      }
    }, 12000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  useEffect(() => {
    // ... your existing code ...

    // Start an interval to increase currentBlock every 12 seconds
    const intervalId = setInterval(increaseCurrentBlock, 12000);

    // Cleanup function to clear the interval when the component unmounts
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const active = showAnim && animMedia ? animMedia : staticMedia;

  return (
    <div className="nft-renderer">
      {stillUrl ? (
        <div
          className="ambient-bg"
          style={{ backgroundImage: `url("${stillUrl}")` }}
        />
      ) : null}
      {active ? (
        <div className="content-card">{renderContent(active)}</div>
      ) : animMedia ? (
        <div className="interactive-gate">
          <p>
            This piece is interactive code. It runs sandboxed, and only when
            you start it.
          </p>
          <button
            type="button"
            className="media-toggle inline"
            onClick={() => setShowAnim(true)}
          >
            ▶ {animationLabel(animMedia.type)}
          </button>
        </div>
      ) : mediaFailed ? (
        <div className="interactive-gate">
          <p>This piece&apos;s media can&apos;t be displayed here.</p>
          <a
            className="media-toggle inline"
            href={`https://opensea.io/assets/ethereum/${nftContract}/${tokenId}`}
            target="_blank"
            rel="noreferrer"
          >
            View on OpenSea ↗
          </a>
        </div>
      ) : (
        <p className="loader">Fetching the piece on view</p>
      )}
      {staticMedia && animMedia ? (
        <button
          type="button"
          className="media-toggle"
          onClick={() => setShowAnim((value) => !value)}
        >
          {showAnim
            ? "Show still image"
            : "▶ " + animationLabel(animMedia.type)}
        </button>
      ) : null}
    </div>
  );
};

export default JukeBoxInterface;
