"use client";
import ConnectButton from "@/components/ConnectButton";

const JUKE_TOKEN = "0xEb01299cd6C93E1030280234E4Cd62E2fe7F8ad4";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const Header = () => {
  return (
    <header className="site-header">
      <a className="wordmark" href="#stage" aria-label="Jukebox — back to the stage">
        Jukebox
        <span className="mark-dot" aria-hidden="true" />
      </a>
      <nav className="site-nav" aria-label="Primary">
        <a href="#manifesto">Manifesto</a>
        <a href="#protocol">Protocol</a>
        <a href="#faq">FAQ</a>
        <a
          href={`https://app.uniswap.org/swap?chain=mainnet&inputCurrency=${WETH}&outputCurrency=${JUKE_TOKEN}`}
          target="_blank"
          rel="noreferrer"
        >
          $JUKE ↗
        </a>
      </nav>
      <ConnectButton />
    </header>
  );
};

export default Header;
