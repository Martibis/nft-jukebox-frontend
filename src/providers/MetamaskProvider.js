"use client";

import { createContext, useContext, useState, useEffect } from "react";
import detectEthereumProvider from "@metamask/detect-provider";
import { ethers } from "ethers";
import Web3Token from "web3-token";

const MetamaskContext = createContext();
const MetamaskUpdateContext = createContext();
const MetamaskAuthContext = createContext();
const MetamaskChangeChainContext = createContext();

export function useMetamask() {
    return useContext(MetamaskContext);
}

export function useMetamaskUpdate() {
    return useContext(MetamaskUpdateContext);
}

export function useMetamaskAuth() {
    return useContext(MetamaskAuthContext);
}

export function useMetamaskChangeChain() {
    return useContext(MetamaskChangeChainContext);
}

const MetamaskProvider = ({ children }) => {
    const [installed, setInstalled] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const [authenticating, setAuthenticating] = useState(false);
    const [accounts, setAccounts] = useState([]);
    const [chain, setChain] = useState(1);
    const [token, setToken] = useState();

    function subscribeToAccountsChanged() {
        try {
            window.ethereum.on("accountsChanged", async (accounts) => {
                // await updateInterceptor(token, chain, accounts[0]);
                setAccounts(accounts);
            });
        } catch (e) {
            setInstalled(false);
            console.log(e);
        }
    }

    function subscribeToChainChanged() {
        try {
            window.ethereum.on("chainChanged", async (chainId) => {
                console.log(chainId);
                //await updateInterceptor(token, chainId, accounts[0]);
                setChain(chainId);
                setToken();
            });
        } catch (e) {
            setInstalled(false);
            console.log(e);
        }
    }

    async function changeChain(chainId) {
        try {
            await window.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: ethers.utils.hexStripZeros(ethers.BigNumber.from(chainId).toHexString()) }],
            });
        } catch (error) {
            console.error(error);
        }
    }


    useEffect(() => {
        const getAccountsAndChain = async () => {
            try {
                if (window?.ethereum) {
                    setInstalled(true);
                    const provider = new ethers.providers.Web3Provider(
                        await detectEthereumProvider()
                    );
                    console.log(provider);

                    setConnecting(true);
                    let chain = await provider.getNetwork();
                    let accounts = await provider.listAccounts();

                    //await updateInterceptor(token, chain.chainId, accounts[0]);

                    setAccounts(accounts);
                    setChain(chain.chainId);

                    subscribeToAccountsChanged();
                    subscribeToChainChanged();

                    setConnecting(false);
                } else {
                    setInstalled(false);
                }
            } catch (e) {
                setConnecting(false);
                console.log(e);
            }
        };

        try {
            getAccountsAndChain();
        } catch (e) {
            setInstalled(false);
            console.log(e);
        }
    }, []);

    async function authenticateMetamask() {
        if (token === undefined) {
            setAuthenticating(true);
            const provider = new ethers.providers.Web3Provider(
                await detectEthereumProvider()
            );
            const signer = provider.getSigner();

            let tokenToSet;
            try {
                tokenToSet = await Web3Token.sign(
                    async (msg) => await signer.signMessage(msg),
                    "1d"
                );
            } catch (e) {
                console.log(e);
            }
            //await updateInterceptor(tokenToSet, chain, accounts[0]);
            setToken(tokenToSet);
            setAuthenticating(false);
            return tokenToSet;
        } else {
            return token;
        }
    }

    async function connectMetamask() {
        const getAccountsAndChain = async () => {
            try {
                if (window?.ethereum) {
                    setInstalled(true);
                    const provider = new ethers.providers.Web3Provider(
                        await detectEthereumProvider()
                    );
                    console.log(provider);

                    setConnecting(true);
                    let chain = await provider.getNetwork();
                    let accounts = await provider.listAccounts();

                    //await updateInterceptor(token, chain.chainId, accounts[0]);

                    setAccounts(accounts);
                    setChain(chain.chainId);

                    subscribeToAccountsChanged();
                    subscribeToChainChanged();

                    setConnecting(false);
                } else {
                    setInstalled(false);
                }
            } catch (e) {
                setConnecting(false);
                console.log(e);
            }
        };


        try {
            await getAccountsAndChain().then(async () => {
                try {
                    const provider = new ethers.providers.Web3Provider(
                        await detectEthereumProvider()
                    );
                    setConnecting(true);

                    if (
                        !(((chain.toString() === "0x1" ||
                            chain === 1 ||
                            chain?.chainId === 1)))
                    ) {
                        await window.ethereum.request({
                            method: "wallet_switchEthereumChain",
                            params: [
                                {
                                    chainId: "0x1"
                                },
                            ], // chainId must be in hexadecimal numbers
                        });
                        if (window.screen.width < 700) {
                            await provider.send("eth_requestAccounts", []);
                        } else {
                            await window.ethereum
                                .request({
                                    method: "wallet_requestPermissions",
                                    params: [
                                        {
                                            eth_accounts: {},
                                        },
                                    ],
                                })
                                .finally(() => provider.send("eth_requestAccounts", []));
                        }
                    } else {
                        if (window.screen.width < 700) {
                            await provider.send("eth_requestAccounts", []);
                        } else {
                            await window.ethereum
                                .request({
                                    method: "wallet_requestPermissions",
                                    params: [
                                        {
                                            eth_accounts: {},
                                        },
                                    ],
                                })
                                .finally(() => provider.send("eth_requestAccounts", []));
                        }
                    }
                    setConnecting(false);
                } catch (e) {
                    setConnecting(false);
                    console.log(e);
                }
            });
        } catch (e) {
            setInstalled(false);
            console.log(e);
        }
    }

    return (
        <MetamaskContext.Provider
            value={{
                installed: installed,
                connecting: connecting,
                accounts: accounts,
                chain: chain,
                token: token,
                authenticating: authenticating,
            }}
        >
            <MetamaskUpdateContext.Provider value={connectMetamask}>
                <MetamaskAuthContext.Provider value={authenticateMetamask}>
                    <MetamaskChangeChainContext.Provider value={changeChain}> {/* 3. Pass the function to the new context provider */}
                        <div key={chain}>
                            {children}
                        </div>
                    </MetamaskChangeChainContext.Provider>
                </MetamaskAuthContext.Provider>
            </MetamaskUpdateContext.Provider>
        </MetamaskContext.Provider>
    );
};

export default MetamaskProvider;
