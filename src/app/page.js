"use client";
import "./page.scss";
import Header from "@/components/Header";
import Stage from "@/components/Stage";
import Archive from "@/components/Archive";
import InfoSections from "@/components/InfoSections";

const JUKE_TOKEN = "0xEb01299cd6C93E1030280234E4Cd62E2fe7F8ad4";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const Home = () => {
  return (
    <div className="page">
      <Header />
      <main>
        <h1 className="sr-only">
          NFT Jukebox — the on-chain stage. Play any NFT on Ethereum and earn
          120 $JUKE every block it stays on view.
        </h1>
        <Stage />
        <Archive />
        <InfoSections />
      </main>
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="wordmark">
              Jukebox
              <span className="mark-dot" aria-hidden="true" />
            </span>
            <p>An autonomous exhibition protocol on Ethereum.</p>
          </div>
          <nav className="footer-links" aria-label="Footer">
            <a href="#manifesto">Manifesto</a>
            <a href="#protocol">Protocol</a>
            <a href="#faq">FAQ</a>
            <a
              href={`https://app.uniswap.org/swap?chain=mainnet&inputCurrency=${WETH}&outputCurrency=${JUKE_TOKEN}`}
              target="_blank"
              rel="noreferrer"
            >
              Uniswap ↗
            </a>
            <a
              href={`https://etherscan.io/address/${JUKE_TOKEN}`}
              target="_blank"
              rel="noreferrer"
            >
              Etherscan ↗
            </a>
            <a
              href="https://github.com/Martibis/nft-jukebox-frontend"
              target="_blank"
              rel="noreferrer"
            >
              GitHub ↗
            </a>
          </nav>
          <p className="footnote">
            $JUKE is a protocol emission with no promise of value.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Home;
