"use client";
import { useEffect, useState } from "react";
import { getPlays, refreshPlays, getNftDisplay } from "@/lib/jukebox";

const PAGE_SIZE = 6;

const shortAddress = (value) => {
  if (!value) return "—";
  if (value.startsWith("0x") && value.length > 12) {
    return `${value.slice(0, 6)}…${value.slice(-4)}`;
  }
  return value;
};

// 19,320 → 19.3K, 2,450,000 → 2.5M — card meta has no room for long numbers
const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

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
  const openseaUrl = `https://opensea.io/assets/ethereum/${entry.nftContract}/${entry.tokenId}`;

  const linkOrSpan = (href, title, children) =>
    href ? (
      <a href={href} target="_blank" rel="noreferrer" title={title}>
        {children}
      </a>
    ) : (
      <span title={title}>{children}</span>
    );

  return (
    <article className="archive-card">
      <a
        className="thumb"
        href={openseaUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="View this piece on OpenSea"
      >
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
      </a>
      <p className="a-name" title={meta?.name}>
        <a href={openseaUrl} target="_blank" rel="noreferrer">
          {meta?.name || (failed ? `#${entry.tokenId}` : "…")}
        </a>
      </p>
      <p className="a-meta">
        {linkOrSpan(
          entry.txHash ? `https://etherscan.io/tx/${entry.txHash}` : null,
          `On view for ${entry.blocksHeld.toLocaleString("en-US")} blocks — view the play transaction`,
          `${compact.format(entry.blocksHeld)} blocks`
        )}
      </p>
      <p className="a-meta">
        {linkOrSpan(
          entry.payoutTxHash
            ? `https://etherscan.io/tx/${entry.payoutTxHash}`
            : null,
          `${entry.earned.toLocaleString("en-US")} $JUKE earned — view the payout transaction`,
          `${compact.format(entry.earned)} $JUKE`
        )}
      </p>
      <p className="a-meta a-player">
        {linkOrSpan(
          `https://etherscan.io/address/${entry.player}`,
          entry.player,
          `by ${entry.playerEns || shortAddress(entry.player)}`
        )}
      </p>
    </article>
  );
};

const Archive = () => {
  const [entries, setEntries] = useState(null);
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    let newestKnown = 0; // startBlock of the newest play in our list
    let stageStart = 0; // startBlock the stage says is current
    let syncedFor = 0; // guard: one fresh refetch per detected mismatch

    // The CDN can serve a stale play list right after a stage change; the
    // stage snapshot tells us the current startBlock, so a list that
    // doesn't contain it yet is stale — refetch past the CDN once.
    const maybeSync = () => {
      if (
        !stageStart ||
        !newestKnown ||
        stageStart <= newestKnown ||
        syncedFor === stageStart
      ) {
        return;
      }
      syncedFor = stageStart;
      refreshPlays()
        .then((plays) => !cancelled && apply(plays))
        .catch(() => {
          /* keep the current list */
        });
    };

    const apply = (plays) => {
      newestKnown = plays.length ? plays[plays.length - 1].startBlock : 0;
      // Every play except the current one (last), most recent first.
      // Blocks held = until the next play's start block.
      const previous = plays.slice(0, -1).map((play, i) => ({
        ...play,
        blocksHeld: plays[i + 1].startBlock - play.startBlock,
        earned: 120 * (plays[i + 1].startBlock - play.startBlock),
        // The $JUKE payout is lazy — it lands in the tx of the play that
        // took this piece off the stage.
        payoutTxHash: plays[i + 1].txHash || null,
      }));
      setEntries(previous.reverse());
      maybeSync();
    };

    // Track what the stage says is current (published by JukeBoxInterface)
    const onNowPlaying = (e) => {
      const startBlock = e?.detail?.startBlock;
      if (startBlock && startBlock > stageStart) {
        stageStart = startBlock;
        maybeSync();
      }
    };
    window.addEventListener("now-playing", onNowPlaying);

    // A transient /api/plays failure shouldn't hide the archive for the
    // whole session — retry a few times with backoff before giving up.
    const load = (attempt = 0) => {
      getPlays()
        .then((plays) => !cancelled && apply(plays))
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

    // When the stage changes hands, the finished piece belongs in the
    // archive. The server state is already rebuilt by the time this event
    // fires, and refreshPlays bypasses the CDN — refetch right away.
    const onStageChange = () => {
      refreshPlays()
        .then((plays) => !cancelled && apply(plays))
        .catch(() => {
          /* keep the current list */
        });
    };
    window.addEventListener("jukebox-plays-changed", onStageChange);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("now-playing", onNowPlaying);
      window.removeEventListener("jukebox-plays-changed", onStageChange);
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
