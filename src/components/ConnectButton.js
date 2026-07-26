
import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Tooltip } from 'react-tooltip'
import { ethers } from 'ethers';
import { useMetamask, useMetamaskUpdate } from '@/providers/MetamaskProvider';

const JUKE_TOKEN = "0xEb01299cd6C93E1030280234E4Cd62E2fe7F8ad4";

const formatJuke = (value) =>
    new Intl.NumberFormat("en-US", {
        notation: value >= 100000 ? "compact" : "standard",
        maximumFractionDigits: value >= 100000 ? 1 : 0,
    }).format(value);

const ConnectButton = () => {
    const connect = useMetamaskUpdate();
    const metamask = useMetamask();
    const [balance, setBalance] = useState(null);

    const ttid = uuidv4();

    const onMainnet =
        metamask.chain?.toString() === "0x1" ||
        metamask.chain === 1 ||
        metamask.chain?.chainId === 1;
    const account = metamask.accounts?.[0];

    // Show the wallet's $JUKE balance once connected
    useEffect(() => {
        if (!account || !onMainnet || typeof window === "undefined" || !window.ethereum) {
            setBalance(null);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const provider = new ethers.providers.Web3Provider(window.ethereum);
                const token = new ethers.Contract(
                    JUKE_TOKEN,
                    ["function balanceOf(address) view returns (uint256)"],
                    provider
                );
                const raw = await token.balanceOf(account);
                if (!cancelled) {
                    setBalance(parseFloat(ethers.utils.formatEther(raw)));
                }
            } catch (_) {
                if (!cancelled) setBalance(null);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [account, onMainnet]);

    return metamask.installed ? (
        <div
            data-tooltip-id={ttid}
            data-tooltip-content={account || ""}
            className={
                "connect-button " +
                (metamask.connecting
                    ? "connecting"
                    : metamask.accounts.length > 0
                        ? "connected"
                        : "")
            }
            onClick={connect}
        >
            <Tooltip id={ttid} />
            <p>
                {account
                    ? onMainnet
                        ? (balance != null ? formatJuke(balance) + " $JUKE · " : "") +
                        account.substring(0, 6) + "…" + account.slice(-4)
                        : "Switch to Mainnet"
                    : "Connect Wallet"}
                <span className={"status "}> ●</span>
            </p>
        </div>
    ) : (
        <div className="connect-button">
            <a href="https://metamask.io" target="_blank" rel="noreferrer">
                Install MetaMask
            </a>
        </div>
    );
};

export default ConnectButton;
