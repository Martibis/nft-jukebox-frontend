"use client";
import PlayButton from "@/components/PlayButton";

import { useEffect, useState } from "react";

const FooterBar = () => {
  const [now, setNow] = useState({});

  useEffect(() => {
    const handler = (e) =>
      setNow((prev) => ({
        ...prev,
        ...(e?.detail || {}),
      }));
    window.addEventListener("now-playing", handler);
    return () => window.removeEventListener("now-playing", handler);
  }, []);

  const earned =
    now?.startBlock != null && now?.currentBlock != null
      ? 120 * (now.currentBlock - now.startBlock)
      : undefined;

  return (
    <div className="footer-bar wood-surface">
      {" "}
      <div className="now-playing">
        {" "}
        {now?.nftContract && now?.tokenId ? (
          <>
            {" "}
            <div className="row">
              {" "}
              <span className="label">Now playing:</span>{" "}
              <span className="value" title={now?.name}>
                {" "}
                {now?.name || "Unknown"}
              </span>{" "}
              <a
                className="opensea-link"
                href={`https://opensea.io/assets/ethereum/${now.nftContract}/${now.tokenId}`}
                target="_blank"
                rel="noreferrer"
              >
                Opensea
              </a>{" "}
            </div>{" "}
            <div className="row">
              {" "}
              <span className="label">Played by:</span>{" "}
              {now?.player ? (
                <a
                  className="address"
                  href={`https://etherscan.io/address/${now.player}`}
                  target="_blank"
                  rel="noreferrer"
                  title={now.player}
                >
                  {" "}
                  {now.player}
                </a>
              ) : (
                <span className="address">—</span>
              )}
              {earned != null && (
                <span className="earned">
                  {" "}
                  {earned}
                  $JUKE
                </span>
              )}
            </div>{" "}
          </>
        ) : (
          <span>Loading...</span>
        )}
      </div>{" "}
      <div className="footer-cta">
        {" "}
        <PlayButton triggerLabel={"Play NFT"} />{" "}
      </div>{" "}
      <span className="footer-tagline">Earn $JUKE as long as it stays up</span>{" "}
    </div>
  );
};

export default FooterBar;
