import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import JukeBoxTokenABI from '../data/JukeBoxToken.json';
import DOMPurify from 'dompurify';

const JukeBoxInterface = () => {
    const contractAddress = '0x89f22a95def3B0fb274337b4226153E003A72aB5';
    const [contentURL, setContentURL] = useState('');
    const [contentType, setContentType] = useState('');
    const [isBase64Content, setIsBase64Content] = useState(false);

    function isBase64(str) {
        const base64Regex = /^data:(.*?);base64,(.*)$/;
        return base64Regex.test(str);
    }

    const fetchNowPlaying = async (contract) => {
        const tokenURI = await contract.nowPlaying();
        let metadata;

        if (isBase64(tokenURI)) {
            const decoded = atob(tokenURI.split(',')[1]);
            metadata = JSON.parse(decoded);
        } else {
            console.log(tokenURI);
            const processedURI = processIpfsUri(tokenURI);
            const response = await fetch(processedURI);
            metadata = await response.json();
        }

        if (metadata.animation_url) {
            processContent(metadata.animation_url);
        } else if (metadata.image_data) {
            setContentURL(`data:image/svg+xml;base64,${metadata.image_data}`);
            setContentType('image/svg+xml');
            setIsBase64Content(true);
        } else if (metadata.image) {
            processContent(metadata.image);
        }
    };

    const processContent = async (uri) => {
        let processedURI = uri;
        if (!isBase64(uri)) {
            processedURI = processIpfsUri(uri);
        }

        if (isBase64(uri)) {
            const mimeType = uri.match(/^data:(.*?);base64,/)[1];
            setContentType(mimeType);
            setContentURL(uri);
            setIsBase64Content(true);
        } else {
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
        }
        return uri;
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
        });

        fetchNowPlaying(contract);

        return () => {
            contract.removeAllListeners('NFTPlayed');
        };
    }, []);

    return (
        <div className='nft-renderer'>
            {contentURL && contentType ? (
                renderContent()
            ) : (
                <p className='loader'>Loading NFT...</p>
            )}
        </div>

    );
};

export default JukeBoxInterface;
