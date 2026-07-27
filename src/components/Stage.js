"use client";
import { useEffect, useState } from "react";
import JukeBoxInterface from "@/components/JukeBoxInterface";
import PlayButton from "@/components/PlayButton";

const shortAddress = (value) => {
  if (!value) return "—";
  // Keep ENS names intact, truncate raw hex addresses
  if (value.startsWith("0x") && value.length > 12) {
    return `${value.slice(0, 6)}…${value.slice(-4)}`;
  }
  return value;
};

const Stage = () => {
  const [now, setNow] = useState({});
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const handler = (e) =>
      setNow((prev) => ({
        ...prev,
        ...(e?.detail || {}),
      }));
    window.addEventListener("now-playing", handler);
    return () => window.removeEventListener("now-playing", handler);
  }, []);

  // Reflect the piece on view in the browser tab
  useEffect(() => {
    if (now?.name) {
      document.title = `▶ ${now.name} · NFT Jukebox`;
    }
  }, [now?.name]);

  // Default on — the per-block check hits the CDN-cached snapshot, not an RPC
  useEffect(() => {
    setAutoRefresh(localStorage.getItem("jukebox-auto-sync") !== "0");
  }, []);

  const toggleAutoRefresh = () => {
    setAutoRefresh((prev) => {
      localStorage.setItem("jukebox-auto-sync", prev ? "0" : "1");
      return !prev;
    });
  };

  const refresh = () => {
    window.dispatchEvent(new Event("jukebox-refresh"));
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  };

  const blocksHeld =
    now?.startBlock != null && now?.currentBlock != null
      ? now.currentBlock - now.startBlock
      : undefined;
  const earned = blocksHeld != null ? 120 * blocksHeld : undefined;

  const loaded = Boolean(now?.nftContract && now?.tokenId);

  return (
    <section id="stage" className="stage" aria-label="Now on stage">
      <div className="stage-eyebrow">
        <span className="live">
          <i className="live-dot" aria-hidden="true" />
          Now playing · Ethereum mainnet
        </span>
        <div className="stage-tools">
          <button
            type="button"
            className="tool-btn"
            onClick={refresh}
            title="Refetch the piece on view"
          >
            <span className={refreshing ? "spin-icon" : undefined} aria-hidden="true">
              ↻
            </span>{" "}
            Refresh
          </button>
          <button
            type="button"
            className={"tool-btn" + (autoRefresh ? " active" : "")}
            onClick={toggleAutoRefresh}
            title="Re-check the stage every block (~12s)"
          >
            Auto-sync {autoRefresh ? "on" : "off"}
          </button>
          {now?.currentBlock ? (
            <span className="block-num">
              Block {now.currentBlock.toLocaleString("en-US")}
            </span>
          ) : null}
        </div>
      </div>

      <div className="artwork">
        <JukeBoxInterface autoRefresh={autoRefresh} />
      </div>

      <div className="placard" aria-live="polite">
        {loaded ? (
          <>
            <div className="placard-piece">
              <h2 className="piece-title" title={now?.name}>
                {now?.name || "Untitled"}
              </h2>
              <p className="piece-meta">
                Played by{" "}
                {now?.player ? (
                  <a
                    href={`https://etherscan.io/address/${now.player}`}
                    target="_blank"
                    rel="noreferrer"
                    title={now.player}
                  >
                    {shortAddress(now.player)}
                  </a>
                ) : (
                  <span>—</span>
                )}
                {" · "}
                <a
                  href={`https://opensea.io/assets/ethereum/${now.nftContract}/${now.tokenId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  OpenSea ↗
                </a>
              </p>
            </div>
            <div className="placard-live">
              {earned != null && earned >= 0 && (
                <p className="accrued" title="Accruing 120 $JUKE per block, paid out when the stage changes hands">
                  {earned.toLocaleString("en-US")} $JUKE accrued
                </p>
              )}
              {blocksHeld != null && blocksHeld >= 0 && (
                <p className="held">
                  On view for {blocksHeld.toLocaleString("en-US")} blocks
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="placard-skeleton" aria-label="Loading the piece on view">
            <span className="skeleton-line w-title" />
            <span className="skeleton-line w-meta" />
          </div>
        )}
        <div className="placard-cta">
          <PlayButton triggerLabel="Take the Stage" />
        </div>
      </div>
    </section>
  );
};

export default Stage;
