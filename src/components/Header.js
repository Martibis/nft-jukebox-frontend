"use client";
import ConnectButton from "@/components/ConnectButton";

const Header = () => {
  return (
    <div className="main-menu wood-surface">
      {" "}
      <div className="brand">
        {" "}
        <div className="logo">NFT Jukebox</div>{" "}
      </div>{" "}
      <div className="links">
        {" "}
        <a
          href="https://app.uniswap.org/swap?chain=mainnet&inputCurrency=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&outputCurrency=0xEb01299cd6C93E1030280234E4Cd62E2fe7F8ad4"
          target="_blank"
          rel="noreferrer"
        >
          {" "}
          Uniswap{" "}
        </a>{" "}
        <a
          href="https://etherscan.io/address/0xEb01299cd6C93E1030280234E4Cd62E2fe7F8ad4"
          target="_blank"
          rel="noreferrer"
        >
          {" "}
          Etherscan{" "}
        </a>{" "}
        <ConnectButton />{" "}
      </div>{" "}
    </div>
  );
};

export default Header;
