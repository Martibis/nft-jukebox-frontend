import React, { useEffect, useRef, useState } from "react";

import { ethers } from "ethers";
import JukeBoxTokenABI from "../data/JukeBoxToken.json";
import NftABI from "../data/Nft.json";
import ModelViewer from "./ModelViewer";
import {
  fetchJson,
  thumbUrl,
  isSafeType,
  resolveMediaPair,
  getReadProvider,
} from "@/lib/jukebox";

const animationLabel = (type) => {
  if (type.startsWith("video/")) return "Play video";
  if (type.startsWith("audio/")) return "Play audio";
  if (type.startsWith("model/")) return "View in 3D";
  return "Run interactive piece";
};

// Last successfully resolved piece, shown instantly on the next visit while
// fresh chain data loads (which then overwrites it unconditionally).
const LAST_PIECE_KEY = "jukebox-last-piece";
const LAST_PIECE_MAX_BYTES = 800_000; // stay well under localStorage quota

const JukeBoxInterface = ({ autoRefresh = false }) => {
  const contractAddress = "0xEb01299cd6C93E1030280234E4Cd62E2fe7F8ad4";
  const startBlockRef = useRef(0);
  const liveLoadedRef = useRef(false); // true once real chain data applied
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
    const provider = getReadProvider();

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
      liveLoadedRef.current = true;
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

    const { staticMedia: staticM, animMedia: animM } =
      await resolveMediaPair(metadata);

    liveLoadedRef.current = true;
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

    // Remember this piece for an instant paint on the next visit
    if (staticM || animM) {
      try {
        const snapshot = JSON.stringify({
          name: metadata.name || fallbackName,
          staticMedia: staticM,
          animMedia: animM,
        });
        if (snapshot.length < LAST_PIECE_MAX_BYTES) {
          localStorage.setItem(LAST_PIECE_KEY, snapshot);
        }
      } catch (_) {
        /* quota or serialization issues — just skip the cache */
      }
    }
  };

  const fetchPlayer = async (contract) => {
    const provider = getReadProvider();

    const player = await contract.player();

    let potentialEns = await provider.lookupAddress(player);

    if (potentialEns) {
      setPlayer(potentialEns);
    } else {
      setPlayer(player);
    }

    publishNowPlaying({ player: potentialEns || player });
  };

  // Stage rendition: ~1024px WebP via the compression endpoint. At display
  // size it's visually identical to the original at a fraction of the bytes
  // (the endpoint falls back to the original for SVG etc.).
  const stillUrl =
    staticMedia && staticMedia.type.startsWith("image/")
      ? staticMedia.origin
        ? thumbUrl(staticMedia.origin, 1024)
        : staticMedia.url
      : "";

  // The backdrop is blurred to oblivion anyway — a tiny rendition suffices.
  const ambientUrl =
    stillUrl && staticMedia.origin ? thumbUrl(staticMedia.origin, 256) : stillUrl;

  const renderContent = (media) => {
    const kind = media.type;

    if (kind.startsWith("image/")) {
      return (
        <img
          src={media.origin ? thumbUrl(media.origin, 1024) : media.url}
          alt={name || "NFT artwork currently on view"}
        />
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

  // Paint the last known piece immediately; the chain fetch below replaces
  // it as soon as real data arrives (or confirms it's the same piece).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_PIECE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || (!saved.staticMedia && !saved.animMedia)) return;

      // Only fill in still-empty state, never overwrite fresh data
      setStaticMedia((current) => current || saved.staticMedia || null);
      setAnimMedia((current) => current || saved.animMedia || null);
      if (saved.name) {
        setName((current) => current || saved.name);
        publishNowPlaying({ name: saved.name });
      }
      if (
        !saved.staticMedia &&
        saved.animMedia &&
        isSafeType(saved.animMedia.type)
      ) {
        setShowAnim(true);
      }
    } catch (_) {
      /* corrupt cache — ignore, the chain fetch will repopulate it */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Server snapshot: gives first-time visitors an instant paint too, and is
  // fresher than localStorage (CDN-cached ~12s). Live chain data still wins.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/now-playing");
        if (!response.ok) return;
        const snap = await response.json();
        if (cancelled || liveLoadedRef.current) return;
        if (!snap || (!snap.staticMedia && !snap.animMedia)) return;

        setStaticMedia(snap.staticMedia || null);
        setAnimMedia(snap.animMedia || null);
        setShowAnim(
          Boolean(
            !snap.staticMedia &&
              snap.animMedia &&
              isSafeType(snap.animMedia.type)
          )
        );
        if (snap.name) {
          setName(snap.name);
          publishNowPlaying({ name: snap.name });
        }
      } catch (_) {
        /* snapshot is best-effort */
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // NOTE: deliberately no contract.on("NFTPlayed") subscription — ethers v5
  // implements it by polling the RPC every 4 seconds (~1,800 requests/hour
  // per open tab). Stage changes are detected via the CDN-cached snapshot
  // poll below instead, which costs no RPC calls at all.
  useEffect(() => {
    const contract = new ethers.Contract(
      contractAddress,
      JukeBoxTokenABI,
      getReadProvider()
    );

    fetchNowPlaying(contract);
    fetchPlayer(contract);

    // Manual refresh, triggered from the stage toolbar
    const refresh = () => {
      fetchNowPlaying(contract);
      fetchPlayer(contract);
    };
    window.addEventListener("jukebox-refresh", refresh);

    return () => {
      window.removeEventListener("jukebox-refresh", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-sync: once per block (~12s), ask the server snapshot whether the
  // stage changed hands. The response comes from the CDN/server cache, so an
  // idle tab makes zero RPC calls; a full refetch happens only on a change.
  useEffect(() => {
    if (!autoRefresh) return;

    const contract = new ethers.Contract(
      contractAddress,
      JukeBoxTokenABI,
      getReadProvider()
    );

    const intervalId = setInterval(async () => {
      try {
        const response = await fetch("/api/now-playing");
        if (!response.ok) return;
        const snap = await response.json();
        if (
          snap?.startBlock &&
          startBlockRef.current &&
          snap.startBlock !== startBlockRef.current
        ) {
          await fetchNowPlaying(contract);
          await fetchPlayer(contract);
        }
      } catch (_) {
        /* transient error — try again next block */
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
      {ambientUrl ? (
        <div
          className="ambient-bg"
          style={{ backgroundImage: `url("${ambientUrl}")` }}
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
