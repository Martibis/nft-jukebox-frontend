import React, { useState } from "react";
import Popup from "reactjs-popup";
import ConnectButton from "./ConnectButton";

import { useMetamask } from "@/providers/MetamaskProvider";

import { ethers } from "ethers";
import JukeBoxTokenABI from "../data/JukeBoxToken.json"; // Adjust the path as necessary

const PlayButton = ({
  triggerLabel = "Show off any NFT and earn $JUKE for as long as it stays up",
}) => {
  const contractAddress = "0xEb01299cd6C93E1030280234E4Cd62E2fe7F8ad4";
  const metamask = useMetamask();
  const [nftContract, setNftContract] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [openseaUrl, setOpenseaUrl] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false); // Loading state

  const parseOpenseaUrl = (url) => {
    try {
      const u = new URL(url);
      // expected pattern: /item/ethereum/<contract>/<tokenId>
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p.toLowerCase() === "item");

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

  const checkNFTValidity = async () => {
    let contractToUse = nftContract;
    let tokenIdToUse = tokenId;

    if (openseaUrl) {
      const parsed = parseOpenseaUrl(openseaUrl.trim());

      if (!parsed) {
        setInfoMessage(
          "Invalid OpenSea URL. Expected /item/ethereum/<contract>/<tokenId>"
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
      setInfoMessage("NFT playing successfully");
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
          trigger={
            <div id="play-nft" className={"play-button"}>
              {" "}
              <p> {triggerLabel}</p>{" "}
            </div>
          }
        >
          {" "}
          <div className="nft-player mint-overlay">
            {" "}
            <input
              type="text"
              placeholder="Paste OpenSea URL"
              value={openseaUrl}
              onChange={(e) => setOpenseaUrl(e.target.value)}
            />{" "}
            <div className="divider">
              {" "}
              <span>OR</span>{" "}
            </div>{" "}
            <input
              type="text"
              placeholder="NFT contract address"
              value={nftContract}
              onChange={(e) => setNftContract(e.target.value)}
            />{" "}
            <input
              type="text"
              placeholder="Token id"
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
            />{" "}
            <div className="play-button" onClick={handlePlay}>
              {" "}
              PLAY NFT{" "}
            </div>{" "}
            {isLoading && <p>Processing...</p>}
            {infoMessage && <p> {infoMessage}</p>}
          </div>{" "}
        </Popup>
      ) : (
        <ConnectButton />
      )}
    </div>
  );
};

export default PlayButton;
