import React, { useEffect, useRef, useState } from "react";

import ModelViewer from "./ModelViewer";
import { thumbUrl, isSafeType } from "@/lib/jukebox";

// Renders the piece on stage. All data comes from /api/now-playing (the
// server-side stage cache) — the browser makes zero chain calls here.

const animationLabel = (type) => {
  if (type.startsWith("video/")) return "Play video";
  if (type.startsWith("audio/")) return "Play audio";
  if (type.startsWith("model/")) return "View in 3D";
  return "Run interactive piece";
};

// Retired localStorage cache — the CDN snapshot paints fast enough, and a
// stored piece could flash stale art after a stage change.
const LAST_PIECE_KEY = "jukebox-last-piece";

const JukeBoxInterface = ({ autoRefresh = false }) => {
  const startBlockRef = useRef(0);
  const [staticMedia, setStaticMedia] = useState(null); // { url, type }
  const [animMedia, setAnimMedia] = useState(null); // { url, type }
  const [showAnim, setShowAnim] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [name, setName] = useState("");
  const [nftContract, setNftContract] = useState("");
  const [tokenId, setTokenId] = useState("");

  const publishNowPlaying = (update) => {
    try {
      window.dispatchEvent(new CustomEvent("now-playing", { detail: update }));
    } catch (_) {
      /* no-op */
    }
  };

  const applySnapshot = (snap) => {
    const tokenIdStr = snap.tokenId != null ? String(snap.tokenId) : "";
    const fallbackName =
      "Token #" +
      (tokenIdStr.length > 10 ? tokenIdStr.slice(0, 6) + "…" : tokenIdStr);
    const pieceName = snap.name || fallbackName;

    startBlockRef.current = snap.startBlock || 0;

    setName(pieceName);
    setNftContract(snap.nftContract || "");
    setTokenId(tokenIdStr);
    setStaticMedia(snap.staticMedia || null);
    setAnimMedia(snap.animMedia || null);
    setMediaFailed(!snap.staticMedia && !snap.animMedia);
    // Still image is the default view; code-free media (video/audio/3D) may
    // play directly when there's no still. HTML always stays behind a click.
    setShowAnim(
      Boolean(
        !snap.staticMedia && snap.animMedia && isSafeType(snap.animMedia.type)
      )
    );

    const detail = { name: pieceName };
    if (snap.nftContract) detail.nftContract = snap.nftContract;
    if (tokenIdStr) detail.tokenId = tokenIdStr;
    if (snap.startBlock) detail.startBlock = snap.startBlock;
    if (snap.player) detail.player = snap.player;
    if (snap.currentBlock) detail.currentBlock = snap.currentBlock;
    publishNowPlaying(detail);
  };

  const loadSnapshot = async () => {
    const response = await fetch("/api/now-playing");
    if (!response.ok) throw new Error("HTTP " + response.status);
    const snap = await response.json();
    if (!snap || snap.error) throw new Error("bad snapshot");
    return snap;
  };

  // Clear the retired localStorage cache for returning visitors
  useEffect(() => {
    try {
      localStorage.removeItem(LAST_PIECE_KEY);
    } catch (_) {
      /* no-op */
    }
  }, []);

  // Initial snapshot (with retries) + manual refresh from the stage toolbar.
  useEffect(() => {
    let cancelled = false;
    let timer = null;
    let freshTimer = null;

    const load = (attempt = 0) => {
      loadSnapshot()
        .then((snap) => !cancelled && applySnapshot(snap))
        .catch(() => {
          if (!cancelled && attempt < 3) {
            timer = setTimeout(() => load(attempt + 1), 3000 * (attempt + 1));
          }
        });
    };
    load();

    const refresh = () => load();
    window.addEventListener("jukebox-refresh", refresh);

    // A play just confirmed in this tab: bypass all caches and re-poll
    // until the server state reflects the new piece.
    const syncFresh = async (attempt = 0) => {
      try {
        const response = await fetch("/api/now-playing?fresh=1", {
          cache: "no-store",
        });
        if (response.ok) {
          const snap = await response.json();
          if (cancelled || !snap || snap.error) return;
          if (snap.startBlock && snap.startBlock !== startBlockRef.current) {
            applySnapshot(snap);
            window.dispatchEvent(new Event("jukebox-plays-changed"));
            return;
          }
        }
      } catch (_) {
        /* retry below */
      }
      if (!cancelled && attempt < 5) {
        freshTimer = setTimeout(() => syncFresh(attempt + 1), 2000);
      }
    };
    const onStaged = () => syncFresh();
    window.addEventListener("jukebox-staged", onStaged);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(freshTimer);
      window.removeEventListener("jukebox-refresh", refresh);
      window.removeEventListener("jukebox-staged", onStaged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-sync: poll the cached snapshot every 4s (a CDN/server-cache hit —
  // zero chain calls from the browser). Only a changed startBlock triggers
  // a repaint, so a running animation is never interrupted.
  useEffect(() => {
    if (!autoRefresh) return;

    const intervalId = setInterval(async () => {
      try {
        const snap = await loadSnapshot();
        if (snap.currentBlock) {
          publishNowPlaying({ currentBlock: snap.currentBlock });
        }
        if (
          snap.startBlock &&
          snap.startBlock !== startBlockRef.current
        ) {
          applySnapshot(snap);
          window.dispatchEvent(new Event("jukebox-plays-changed"));
        }
      } catch (_) {
        /* transient error — try again next tick */
      }
    }, 4000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

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
