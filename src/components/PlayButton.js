import React, { useEffect, useState } from "react";
import Popup from "reactjs-popup";

import { useMetamask, useMetamaskUpdate } from "@/providers/MetamaskProvider";

import { ethers } from "ethers";
import JukeBoxTokenABI from "../data/JukeBoxToken.json"; // Adjust the path as necessary

// Chainlink ETH/USD price feed (mainnet), used for the fee estimate in USD
const ETH_USD_FEED = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";

// Two significant digits instead of fixed decimals — small fees must not
// round down to a misleading "0.0000 ETH".
const formatEth = (value) =>
  value >= 0.001 ? value.toFixed(4) : parseFloat(value.toPrecision(2)).toString();

const formatUsd = (value) => (value < 0.01 ? "<$0.01" : `$${value.toFixed(2)}`);

const PlayButton = ({
  triggerLabel = "Show off any NFT and earn $JUKE for as long as it stays up",
}) => {
  const contractAddress = "0xEb01299cd6C93E1030280234E4Cd62E2fe7F8ad4";
  const metamask = useMetamask();
  const connect = useMetamaskUpdate();
  const [nftContract, setNftContract] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [openseaUrl, setOpenseaUrl] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false); // Loading state
  const [gasEstimate, setGasEstimate] = useState(null); // { eth, usd }
  const [estimating, setEstimating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const parseOpenseaUrl = (url) => {
    try {
      const u = new URL(url);
      // Both formats: /item/ethereum/<contract>/<tokenId> (current)
      // and /assets/ethereum/<contract>/<tokenId> (classic)
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) =>
        ["item", "assets"].includes(p.toLowerCase())
      );

      if (idx !== -1 && parts[idx + 1]?.toLowerCase() === "ethereum") {
        const contract = parts[idx + 2];
        const id = parts[idx + 3];

        if (contract && id)
          return {
            contract,
            id,
          };
      }
    } catch (_) {
      /* no-op */
    }

    return null;
  };

  // Live network-fee estimate: dry-runs playJukeBox. With no input yet, it
  // estimates against the NFT currently on stage (replaying it is a valid
  // transaction, so the cost is representative). Debounced while typing.
  useEffect(() => {
    if (!modalOpen || typeof window === "undefined" || !window.ethereum) {
      setGasEstimate(null);
      setEstimating(false);
      return;
    }

    const empty = !openseaUrl && !nftContract && !tokenId;
    let inputs = null;
    if (openseaUrl) {
      const parsed = parseOpenseaUrl(openseaUrl.trim());
      if (parsed) inputs = { contract: parsed.contract, id: parsed.id };
    } else if (nftContract && tokenId) {
      inputs = { contract: nftContract.trim(), id: tokenId.trim() };
    }

    const validInputs =
      inputs &&
      ethers.utils.isAddress(inputs.contract) &&
      /^\d+$/.test(inputs.id);

    if (!empty && !validInputs) {
      setGasEstimate(null);
      setEstimating(false);
      return;
    }

    let cancelled = false;
    setEstimating(true);

    const timer = setTimeout(
      async () => {
        try {
          const provider = new ethers.providers.Web3Provider(window.ethereum);
          const contract = new ethers.Contract(
            contractAddress,
            JukeBoxTokenABI,
            provider.getSigner()
          );
          const feed = new ethers.Contract(
            ETH_USD_FEED,
            ["function latestAnswer() view returns (int256)"],
            provider
          );

          let target = inputs;
          if (empty) {
            const [currentContract, currentId] = await Promise.all([
              contract.nftContract(),
              contract.tokenId(),
            ]);
            target = { contract: currentContract, id: currentId };
          }

          const [gas, feeData, ethUsd] = await Promise.all([
            contract.estimateGas.playJukeBox(target.contract, target.id),
            provider.getFeeData(),
            feed.latestAnswer().catch(() => null),
          ]);

          // What a wallet actually charges ≈ gas × (base fee + priority
          // tip). eth_gasPrice alone hugs the base fee and can undershoot
          // the real cost by an order of magnitude.
          const effectivePrice =
            feeData.lastBaseFeePerGas && feeData.maxPriorityFeePerGas
              ? feeData.lastBaseFeePerGas.add(feeData.maxPriorityFeePerGas)
              : feeData.maxFeePerGas || feeData.gasPrice;
          if (!effectivePrice) throw new Error("No gas price available");

          const costEth = parseFloat(
            ethers.utils.formatEther(gas.mul(effectivePrice))
          );
          const usd = ethUsd ? costEth * (Number(ethUsd) / 1e8) : null;

          if (!cancelled) setGasEstimate({ eth: costEth, usd });
        } catch (_) {
          if (!cancelled) setGasEstimate(null);
        } finally {
          if (!cancelled) setEstimating(false);
        }
      },
      empty ? 100 : 700
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, openseaUrl, nftContract, tokenId]);

  const checkNFTValidity = async () => {
    let contractToUse = nftContract;
    let tokenIdToUse = tokenId;

    if (openseaUrl) {
      const parsed = parseOpenseaUrl(openseaUrl.trim());

      if (!parsed) {
        setInfoMessage(
          "Invalid OpenSea URL. Expected …/ethereum/<contract>/<tokenId>"
        );
        return false;
      }

      contractToUse = parsed.contract;
      tokenIdToUse = parsed.id;
      // Update visible fields, but don't rely on setState for immediate use
      setNftContract(contractToUse);
      setTokenId(tokenIdToUse);
    }

    if (!contractToUse || !tokenIdToUse) {
      setInfoMessage(
        "Please enter both NFT contract address and Token ID or paste an OpenSea URL"
      );
      return false;
    }

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);

      // Check for ERC721 standard
      try {
        const nftContractERC721 = new ethers.Contract(
          contractToUse,
          ["function tokenURI(uint256 tokenId) view returns (string memory)"],
          provider
        );
        const tokenURI = await nftContractERC721.tokenURI(tokenIdToUse);
        return { tokenURI, contractToUse, tokenIdToUse };
      } catch (error) {
        // ERC721 call failed, try ERC1155
        const nftContractERC1155 = new ethers.Contract(
          contractToUse,
          ["function uri(uint256 tokenId) view returns (string memory)"],
          provider
        );
        const tokenURI = await nftContractERC1155.uri(tokenIdToUse);
        return { tokenURI, contractToUse, tokenIdToUse };
      }
    } catch (error) {
      console.error("Error fetching NFT metadata:", error);
      setInfoMessage(
        "Could not fetch NFT metadata. Please check the contract address and token ID."
      );
      return false;
    }
  };

  const handlePlay = async () => {
    setIsLoading(true);
    setInfoMessage("");
    const result = await checkNFTValidity();

    if (!result) {
      setIsLoading(false); // Stop loading if invalid
      return;
    }

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const contract = new ethers.Contract(
        contractAddress,
        JukeBoxTokenABI,
        signer
      );

      // Use the parsed values directly to avoid relying on async state updates
      const tx = await contract.playJukeBox(
        result.contractToUse,
        result.tokenIdToUse
      );
      await tx.wait(); // Wait for the transaction to be mined
      setInfoMessage("Your NFT is on stage.");
      // Tell the stage to pull the post-transaction state immediately
      window.dispatchEvent(new Event("jukebox-staged"));
    } catch (error) {
      console.error("Error playing NFT:", error);
      setInfoMessage("Failed to play NFT");
    } finally {
      setIsLoading(false); // Stop loading after transaction
    }
  };

  return (
    <div>
      {" "}
      {(metamask.chain.toString() === "0x1" ||
        metamask.chain === 1 ||
        metamask.chain?.chainId === 1) &&
      metamask.accounts.length > 0 ? (
        <Popup
          lockScroll={true}
          modal={true}
          onOpen={() => setModalOpen(true)}
          onClose={() => setModalOpen(false)}
          trigger={
            <div id="play-nft" className={"play-button"}>
              {" "}
              <p> {triggerLabel}</p>{" "}
            </div>
          }
        >
          <div className="nft-player mint-overlay">
            <p className="eyebrow">Jukebox — one transaction</p>
            <h2>Take the stage</h2>
            <p className="modal-sub">
              Play any NFT on Ethereum — yours or anyone else&apos;s. It goes on
              display for everyone, and you accrue 120 $JUKE every block it
              stays up.
            </p>
            <input
              type="text"
              placeholder="Paste an OpenSea URL"
              value={openseaUrl}
              onChange={(e) => setOpenseaUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePlay()}
            />
            <div className="divider">
              <span>or</span>
            </div>
            <input
              type="text"
              placeholder="NFT contract address"
              value={nftContract}
              onChange={(e) => setNftContract(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePlay()}
            />
            <input
              type="text"
              placeholder="Token ID"
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePlay()}
            />
            <div className="play-button" onClick={handlePlay}>
              <p>Take the Stage</p>
            </div>
            {(estimating || gasEstimate) && (
              <p className="gas-note">
                {estimating
                  ? "Estimating network fee…"
                  : `Network fee ≈ ${formatEth(gasEstimate.eth)} ETH` +
                    (gasEstimate.usd != null
                      ? ` (${formatUsd(gasEstimate.usd)})`
                      : "")}
              </p>
            )}
            {isLoading && <p className="status-note">Processing…</p>}
            {infoMessage && <p className="status-note">{infoMessage}</p>}
          </div>
        </Popup>
      ) : metamask.installed ? (
        // Not connected (or wrong network): the CTA itself starts the
        // wallet connection, so the header keeps the only connect button.
        <div className="play-button" onClick={connect}>
          <p>{triggerLabel}</p>
        </div>
      ) : (
        <div className="play-button">
          <a href="https://metamask.io" target="_blank" rel="noreferrer">
            Install MetaMask
          </a>
        </div>
      )}
    </div>
  );
};

export default PlayButton;
