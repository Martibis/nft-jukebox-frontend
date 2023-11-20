
import { v4 as uuidv4 } from 'uuid';
import { Tooltip } from 'react-tooltip'
import { useMetamask, useMetamaskUpdate } from '@/providers/MetamaskProvider';

const ConnectButton = () => {
    const connect = useMetamaskUpdate();
    const metamask = useMetamask();

    const ttid = uuidv4();

    return metamask.installed ? (
        <div
            data-tooltip-id={ttid}
            data-tooltip-content={metamask.accounts.length > 0 ? metamask.accounts[0] : ""}
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
                {metamask.accounts.length > 0
                    ? ((metamask.chain.toString() === "0x1" ||
                        metamask.chain === 1 ||
                        metamask.chain?.chainId === 1))
                        ? metamask.accounts[0].substring(0, 12) + "..."
                        : "Please change network to mainnet first"
                    : "Connect to earn $JUKE"}
                <span className={"status "}> ·</span>
            </p>
        </div>
    ) : (
        <div className="connect-button">
            <a href="https://metamask.io" target="_blank" rel="noreferrer">
                Install metamask
            </a>
        </div>
    );
};

export default ConnectButton;
