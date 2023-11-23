import React, { useState } from 'react';
import Popup from "reactjs-popup";
import ConnectButton from './ConnectButton';
import { useMetamask } from "@/providers/MetamaskProvider";
import { ethers } from 'ethers';
import JukeBoxTokenABI from '../data/JukeBoxToken.json'; // Adjust the path as necessary

const PlayButton = () => {
    const contractAddress = '0x89f22a95def3B0fb274337b4226153E003A72aB5';
    const metamask = useMetamask();
    const [nftContract, setNftContract] = useState('');
    const [tokenId, setTokenId] = useState('');
    const [infoMessage, setInfoMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false); // Loading state

    const checkNFTValidity = async () => {
        if (!nftContract || !tokenId) {
            setInfoMessage("Please enter both NFT contract address and Token ID");
            return false;
        }

        try {
            const provider = new ethers.providers.Web3Provider(window.ethereum);

            // Check for ERC721 standard
            try {
                const nftContractERC721 = new ethers.Contract(nftContract, ['function tokenURI(uint256 tokenId) view returns (string memory)'], provider);
                const tokenURI = await nftContractERC721.tokenURI(tokenId);
                return tokenURI; // Found ERC721 NFT
            } catch (error) {
                // ERC721 call failed, try ERC1155
                const nftContractERC1155 = new ethers.Contract(nftContract, ['function uri(uint256 tokenId) view returns (string memory)'], provider);
                const uri = await nftContractERC1155.uri(tokenId);
                return uri; // Found ERC1155 NFT
            }
        } catch (error) {
            console.error("Error fetching NFT metadata:", error);
            setInfoMessage("Could not fetch NFT metadata. Please check the contract address and token ID.");
            return false;
        }
    };


    const handlePlay = async () => {
        setIsLoading(true);
        setInfoMessage('');
        const tokenURI = await checkNFTValidity();
        if (!tokenURI) {
            setIsLoading(false); // Stop loading if invalid
            return;
        }

        try {
            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const signer = provider.getSigner();
            const contract = new ethers.Contract(contractAddress, JukeBoxTokenABI, signer);

            const tx = await contract.playJukeBox(nftContract, tokenId);
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
            {(((metamask.chain.toString() === "0x1" ||
                metamask.chain === 1 ||
                metamask.chain?.chainId === 1)) && metamask.accounts.length > 0) ?
                <Popup lockScroll={true} modal={true} trigger={<div className={'play-button'}>
                    <p>{`Show off any NFT and earn $JUKE for as long as it stays up`}</p>
                </div>}>
                    {() => (
                        <div className='nft-player'>
                            <input type="text" placeholder="NFT contract address" value={nftContract} onChange={(e) => setNftContract(e.target.value)} />
                            <input type="text" placeholder="Token id" value={tokenId} onChange={(e) => setTokenId(e.target.value)} />
                            <div className='play-button' onClick={handlePlay}>PLAY NFT</div>
                            {isLoading && <p>Processing...</p>}
                            {infoMessage && <p>{infoMessage}</p>}
                        </div>
                    )}
                </Popup> : <ConnectButton />}
        </div>
    );
};

export default PlayButton;
