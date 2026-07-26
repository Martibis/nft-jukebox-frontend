"use client";
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getPlays, getReadProvider } from "@/lib/jukebox";
import faqs from "@/data/faq";

const JUKE_TOKEN = "0xEb01299cd6C93E1030280234E4Cd62E2fe7F8ad4";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const UNISWAP_URL = `https://app.uniswap.org/swap?chain=mainnet&inputCurrency=${WETH}&outputCurrency=${JUKE_TOKEN}`;
const ETHERSCAN_URL = `https://etherscan.io/address/${JUKE_TOKEN}`;
const GITHUB_URL = "https://github.com/Martibis/nft-jukebox-frontend";

const steps = [
  {
    num: "01",
    title: "Take the stage",
    body: "Connect a wallet and play any NFT on Ethereum — yours or anyone else's, an OpenSea link is enough. Your pick replaces whatever is currently on display, in a single on-chain transaction.",
  },
  {
    num: "02",
    title: "Earn every block",
    body: "While your pick is on stage, you accrue 120 $JUKE per Ethereum block — roughly every twelve seconds, for as long as it stays up.",
  },
  {
    num: "03",
    title: "Hold, or be replaced",
    body: "Anyone can take the stage at any moment. When they do, everything you accrued is minted straight to your wallet — the longer you held, the bigger the payout.",
  },
];

const InfoSections = () => {
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState({ minted: null, plays: null });

  // Live protocol stats, read straight from the chain
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = new ethers.Contract(
          JUKE_TOKEN,
          ["function totalSupply() view returns (uint256)"],
          getReadProvider()
        );

        const [supply, plays] = await Promise.all([
          token.totalSupply().catch(() => null),
          getPlays().catch(() => null),
        ]);

        if (cancelled) return;
        setStats({
          minted:
            supply != null
              ? Math.round(parseFloat(ethers.utils.formatEther(supply)))
              : null,
          plays: plays != null ? plays.length : null,
        });
      } catch (_) {
        /* stats stay hidden */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const copyContract = async () => {
    try {
      await navigator.clipboard.writeText(JUKE_TOKEN);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      /* clipboard unavailable — the address is still selectable */
    }
  };

  return (
    <>
      <section id="manifesto" className="section manifesto">
        <div className="section-inner">
          <p className="eyebrow">01 — Manifesto</p>
          <h2>
            One artwork on stage at a time.
            <br />
            The whole chain is <em>watching</em>.
          </h2>
          <p className="lede">
            Jukebox is an autonomous exhibition protocol on Ethereum. A single
            NFT is on display at any moment — any NFT, played by anyone, whether
            they own it or not. Every block it stays up earns 120 $JUKE for the
            player who put it there. No curators, no gatekeepers, no admin keys
            — the stage belongs to whoever takes it.
          </p>
        </div>
      </section>

      <section id="how" className="section how" aria-label="How it plays">
        <div className="section-inner">
          <p className="eyebrow">02 — How it plays</p>
          <h2 className="section-title">
            Three moves, <em>start to finish</em>.
          </h2>
          <div className="steps">
            {steps.map((step) => (
              <div className="step" key={step.num}>
                <p className="num">{step.num}</p>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="protocol" className="section protocol" aria-label="Protocol facts">
        <div className="section-inner">
          <p className="eyebrow">03 — Protocol</p>
          <h2 className="section-title">The key facts.</h2>
          <dl className="facts">
            <div className="fact-row">
              <dt>Protocol</dt>
              <dd>Jukebox — autonomous exhibition</dd>
            </div>
            <div className="fact-row">
              <dt>Network</dt>
              <dd>Ethereum mainnet</dd>
            </div>
            <div className="fact-row">
              <dt>Emission</dt>
              <dd>
                120 $JUKE per block on stage, minted to the player when the
                stage changes hands
              </dd>
            </div>
            <div className="fact-row">
              <dt>Token</dt>
              <dd>$JUKE · ERC-20 · supply uncapped, minted only by play rewards</dd>
            </div>
            <div className="fact-row">
              <dt>Minted to date</dt>
              <dd>
                {stats.minted != null
                  ? `${stats.minted.toLocaleString("en-US")} $JUKE`
                  : "—"}
              </dd>
            </div>
            <div className="fact-row">
              <dt>Plays to date</dt>
              <dd>
                {stats.plays != null
                  ? stats.plays.toLocaleString("en-US")
                  : "—"}
              </dd>
            </div>
            <div className="fact-row">
              <dt>Admin</dt>
              <dd>None — no owner, no admin keys, no upgrades</dd>
            </div>
            <div className="fact-row">
              <dt>Accepts</dt>
              <dd>Any ERC-721 or ERC-1155 — ownership not required</dd>
            </div>
            <div className="fact-row">
              <dt>Contract</dt>
              <dd>
                <span className="addr">{JUKE_TOKEN}</span>
                <button
                  type="button"
                  className={"copy-btn" + (copied ? " copied" : "")}
                  onClick={copyContract}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
                <a href={ETHERSCAN_URL} target="_blank" rel="noreferrer">
                  Etherscan ↗
                </a>
              </dd>
            </div>
            <div className="fact-row">
              <dt>Market</dt>
              <dd>
                <a href={UNISWAP_URL} target="_blank" rel="noreferrer">
                  Uniswap ↗
                </a>
              </dd>
            </div>
            <div className="fact-row">
              <dt>Source</dt>
              <dd>
                <span>Open source — verify it, fork it, build on it</span>
                <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                  GitHub ↗
                </a>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section id="faq" className="section faq" aria-label="Frequently asked questions">
        <div className="section-inner">
          <p className="eyebrow">04 — FAQ</p>
          <h2 className="section-title">Common questions.</h2>
          <div className="faq-list">
            {faqs.map((faq) => (
              <details className="faq-item" key={faq.question}>
                <summary>
                  {faq.question}
                  <span className="plus" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className="answer">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
};

export default InfoSections;
