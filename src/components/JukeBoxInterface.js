import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import JukeBoxTokenABI from '../data/JukeBoxToken.json';
import NftABI from '../data/Nft.json';
import DOMPurify from 'dompurify';

const JukeBoxInterface = () => {
    const contractAddress = '0xEb01299cd6C93E1030280234E4Cd62E2fe7F8ad4';
    const [contentURL, setContentURL] = useState('');
    const [contentType, setContentType] = useState('');
    const [isBase64Content, setIsBase64Content] = useState(false);
    const [name, setName] = useState('');
    const [nftContract, setNftContract] = useState('');
    const [player, setPlayer] = useState('');
    const [owner, setOwner] = useState('');
    const [startBlock, setStartBlock] = useState(0);
    const [currentBlock, setCurrentBlock] = useState(0);
    const [tokenId, setTokenId] = useState(0);

    function isData(str) {
        const dataRegex = /^data:(.*)$/;
        return dataRegex.test(str);
    }

    function isBase64(str) {
        const base64Regex = /^data:(.*?);base64,(.*)$/;
        return base64Regex.test(str);
    }

    const increaseCurrentBlock = () => {
        setCurrentBlock((prevBlock) => prevBlock + 1);
    };

    const fetchNowPlaying = async (contract) => {
        let provider;

        if (typeof window.ethereum !== 'undefined') {
            // If window.ethereum is available, use Web3Provider
            provider = new ethers.providers.Web3Provider(window.ethereum);
        } else {
            // If window.ethereum is not available, use Infura
            provider = new ethers.providers.JsonRpcProvider('https://mainnet.infura.io/v3/bc8d2aba81be4f1b9d33bf7af8989a3c');
        }

        const tokenURI = await contract.nowPlaying();
        const nftContract = await contract.nftContract();
        const tokenId = await contract.tokenId();
        const startBlock = await contract.startBlock();
        let currentBlock = await provider.getBlockNumber();
        console.log(currentBlock);
        setCurrentBlock(currentBlock);
        setStartBlock(startBlock);
        setNftContract(nftContract);
        setTokenId(tokenId);


        const nftContractConnected = new ethers.Contract(nftContract, NftABI, provider);

        let owner = await nftContractConnected.ownerOf(tokenId);

        let potentialEns = await provider.lookupAddress(owner);
        if (potentialEns) {
            setOwner(potentialEns);
        } else {
            setOwner(owner);
        }

        let metadata;

        if (isData(tokenURI)) {
            const commaIndex = tokenURI.indexOf(',');
            const afterComma = tokenURI.substring(commaIndex + 1);

            const decoded = isBase64(tokenURI) ? atob(afterComma) : afterComma;

            metadata = JSON.parse(decoded);
        } else {
            console.log(tokenURI);
            const processedURI = processIpfsUri(tokenURI);
            const response = await fetch(processedURI);
            metadata = await response.json();
        }
        console.log(metadata)

        if (metadata.name) {
            setName(metadata.name);
        }

        if (metadata.animation_url) {
            processContent(metadata.animation_url);
        } else if (metadata.image_data) {
            processContent(metadata.image_data);
        } else if (metadata.image) {
            processContent(metadata.image);
        }
    };

    const fetchPlayer = async (contract) => {
        let provider;

        if (typeof window.ethereum !== 'undefined') {
            // If window.ethereum is available, use Web3Provider
            provider = new ethers.providers.Web3Provider(window.ethereum);
        } else {
            // If window.ethereum is not available, use Infura
            provider = new ethers.providers.JsonRpcProvider('https://mainnet.infura.io/v3/bc8d2aba81be4f1b9d33bf7af8989a3c');
        }
        const player = await contract.player();

        let potentialEns = await provider.lookupAddress(player);

        if (potentialEns) {
            setPlayer(potentialEns);
        } else {
            setPlayer(player);
        }
    };

    const processContent = async (uri) => {
        if (isData(uri)) {
            const mimeType = uri.match(/^data:(.*?);(.*?),/)[1];

            const commaIndex = uri.indexOf(',');
            const beforeComma = uri.substring(0, commaIndex);
            const afterComma = uri.substring(commaIndex + 1);

            const decoded = isBase64(uri) ? uri : (beforeComma + "," + encodeURIComponent(afterComma));

            setContentURL(decoded);
            setContentType(mimeType);

        } else {
            let processedURI = processIpfsUri(uri);
            try {
                const response = await fetch(processedURI, { method: 'HEAD' });
                if (response.ok) {
                    const mimeType = response.headers.get('Content-Type');
                    setContentType(mimeType);
                    setContentURL(processedURI);
                    setIsBase64Content(false);
                } else {
                    console.error('Error fetching content type:', response.statusText);
                }
            } catch (error) {
                console.error('Error fetching content type:', error);
            }
        }
    };

    const processIpfsUri = (uri) => {
        if (uri.startsWith('ipfs://')) {
            return uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
        } else {
            return "https://corsproxy.io/?" + encodeURIComponent(uri);
        }
    };

    const renderContent = () => {
        if (contentType.startsWith('image/') && !isBase64Content) {
            return <img src={contentURL} alt="NFT Image" />;
        } else if (contentType.startsWith('video/') && !isBase64Content) {
            return <video src={contentURL} controls style={{ maxWidth: '100%' }} />;
        } else if (isBase64Content || contentType.startsWith('text/html')) {
            // For Base64 encoded content or HTML, render in a sandboxed iframe
            return (
                <iframe
                    src={DOMPurify.sanitize(contentURL)}
                    sandbox="allow-scripts allow-same-origin"
                    title="NFT Content"
                />
            );
        }
        return <p>Unsupported content type</p>;
    };

    useEffect(() => {
        let provider;

        if (typeof window.ethereum !== 'undefined') {
            // If window.ethereum is available, use Web3Provider
            provider = new ethers.providers.Web3Provider(window.ethereum);
        } else {
            // If window.ethereum is not available, use Infura
            provider = new ethers.providers.JsonRpcProvider('https://mainnet.infura.io/v3/bc8d2aba81be4f1b9d33bf7af8989a3c');
        }

        const contract = new ethers.Contract(contractAddress, JukeBoxTokenABI, provider);

        contract.on('NFTPlayed', async () => {
            await fetchNowPlaying(contract);
            await fetchPlayer(contract);
        });

        fetchNowPlaying(contract);
        fetchPlayer(contract);

        return () => {
            contract.removeAllListeners('NFTPlayed');
        };
    }, []);

    useEffect(() => {
        // ... your existing code ...

        // Start an interval to increase currentBlock every 12 seconds
        const intervalId = setInterval(increaseCurrentBlock, 12000);

        // Cleanup function to clear the interval when the component unmounts
        return () => {
            clearInterval(intervalId);
        };
    }, []);

    return (
        <div className='nft-renderer'>
            {contentURL && contentType ? (
                <div className='all-info'>
                    <p className='info'><a href={'https://opensea.io/assets/ethereum/' + nftContract + '/' + tokenId.toString()} target='_blank' rel="noreferrer">{name}</a>&nbsp;is played by&nbsp; <a href={'https://etherscan.io/address/' + player} target='_blank' rel="noreferrer">{player}</a>&nbsp; who has been earning {120 * (currentBlock - startBlock)} &nbsp;<a href="https://etherscan.io/address/0xEb01299cd6C93E1030280234E4Cd62E2fe7F8ad4" target='_blank' rel="noreferrer">$JUKE</a></p>
                    {/* <p className='info'>Played by {player} who has been earning {120 * (currentBlock - startBlock)} $JUKE</p> */}
                </div>
            ) : (
                <></>
            )}
            {contentURL && contentType ? (
                renderContent()
            ) : (
                <p className='loader'>Loading latest jukebox NFT...</p>
            )}
        </div>

    );
};

export default JukeBoxInterface;
