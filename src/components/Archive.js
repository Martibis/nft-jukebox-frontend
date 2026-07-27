"use client";
import { useEffect, useState } from "react";
import { getPlays, getNftDisplay } from "@/lib/jukebox";

const PAGE_SIZE = 6;

const shortAddress = (value) => {
  if (!value) return "—";
  if (value.startsWith("0x") && value.length > 12) {
    return `${value.slice(0, 6)}…${value.slice(-4)}`;
  }
  return value;
};

const ArchiveCard = ({ entry }) => {
  const [meta, setMeta] = useState(null);
  const [failed, setFailed] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getNftDisplay(entry.nftContract, entry.tokenId)
      .then((m) => !cancelled && setMeta(m))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [entry.nftContract, entry.tokenId]);

  const resolved = failed || meta != null;

  return (
    <a
      className="archive-card"
      href={`https://opensea.io/assets/ethereum/${entry.nftContract}/${entry.tokenId}`}
      target="_blank"
      rel="noreferrer"
    >
      <div className="thumb">
        {meta?.image && !imgError ? (
          <img
            src={meta.image}
            alt={meta?.name || "Archived NFT"}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="thumb-fallback">{resolved ? "···" : ""}</span>
        )}
      </div>
      <p className="a-name" title={meta?.name}>
        {meta?.name || (failed ? `#${entry.tokenId}` : "…")}
      </p>
      <p className="a-meta">
        {entry.blocksHeld.toLocaleString("en-US")} blocks ·{" "}
        {entry.earned.toLocaleString("en-US")} $JUKE
      </p>
      <p className="a-meta">by {shortAddress(entry.player)}</p>
    </a>
  );
};

const Archive = () => {
  const [entries, setEntries] = useState(null);
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    // A transient /api/plays failure shouldn't hide the archive for the
    // whole session — retry a few times with backoff before giving up.
    const load = (attempt = 0) => {
      getPlays()
        .then((plays) => {
          if (cancelled) return;
          // Every play except the current one (last), most recent first.
          // Blocks held = until the next play's start block.
          const previous = plays.slice(0, -1).map((play, i) => ({
            ...play,
            blocksHeld: plays[i + 1].startBlock - play.startBlock,
            earned: 120 * (plays[i + 1].startBlock - play.startBlock),
          }));
          setEntries(previous.reverse());
        })
        .catch(() => {
          if (cancelled) return;
          if (attempt < 3) {
            timer = setTimeout(() => load(attempt + 1), 4000 * (attempt + 1));
          } else {
            setEntries([]);
          }
        });
    };
    load();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (!entries || entries.length === 0) return null;

  return (
    <section id="archive" className="section archive" aria-label="Previously on stage">
      <div className="section-inner">
        <p className="eyebrow">Previously on stage</p>
        <div className="cards">
          {entries.slice(0, visible).map((entry) => (
            <ArchiveCard
              key={`${entry.startBlock}-${entry.nftContract}-${entry.tokenId}`}
              entry={entry}
            />
          ))}
        </div>
        {visible < entries.length && (
          <button
            type="button"
            className="load-more"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
          >
            Load more ({entries.length - visible} earlier)
          </button>
        )}
      </div>
    </section>
  );
};

export default Archive;
