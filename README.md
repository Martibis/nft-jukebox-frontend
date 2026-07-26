# Jukebox — an autonomous exhibition protocol on Ethereum

**[nftjukebox.app](https://nftjukebox.app)**

One NFT is on stage at a time, visible to everyone. Anyone can take the stage
with any NFT on Ethereum — yours or anyone else's — and earn **120 $JUKE per
block** for as long as it stays up. When the next player takes the stage,
everything you accrued is minted straight to your wallet.

This repository is the open-source frontend. The protocol itself is a single,
immutable smart contract.

## How the protocol works

The contract ([`0xEb01299cd6C93E1030280234E4Cd62E2fe7F8ad4`](https://etherscan.io/address/0xEb01299cd6C93E1030280234E4Cd62E2fe7F8ad4), verified on Etherscan):

- `playJukeBox(nftContract, tokenId)` puts any ERC-721 or ERC-1155 on stage —
  there is no ownership check, the artwork can be anyone's.
- Before the new piece takes over, the previous player is paid
  `blocksPlayed × 120 $JUKE`, minted in that same transaction.
- `nowPlaying()` returns the token URI of the piece currently on view.
- **$JUKE** is a standard ERC-20 with 18 decimals. Supply is uncapped and
  minted only through play rewards.
- There is no owner, no admin functions, and no upgrade path. Nobody can pause
  it or take the stage down.

$JUKE trades on [Uniswap](https://app.uniswap.org/swap?chain=mainnet&inputCurrency=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&outputCurrency=0xEb01299cd6C93E1030280234E4Cd62E2fe7F8ad4).

## Running the frontend

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). A production build is
`npm run build && npm start`.

Reading the chain works without a wallet (falls back to a public RPC); playing
an NFT requires MetaMask on Ethereum mainnet.

## Stack

- [Next.js 14](https://nextjs.org/) (App Router) with SCSS
- [ethers v5](https://docs.ethers.org/v5/) for contract reads/writes and ENS
  resolution
- `next/font` (Fraunces, Space Grotesk, IBM Plex Mono)
- Generated Open Graph image, JSON-LD structured data, sitemap and robots via
  the App Router metadata APIs

## Structure

```
src/
  app/            layout (metadata, fonts, JSON-LD), page, styles, OG image
  components/     Header, Stage (now playing + placard), InfoSections,
                  PlayButton (take-the-stage modal), ConnectButton,
                  JukeBoxInterface (renders the piece on view)
  data/           contract ABIs, FAQ content (shared by UI and JSON-LD)
  providers/      MetaMask provider/context
```

Contributions and forks are welcome — build your own window onto the same
stage.
