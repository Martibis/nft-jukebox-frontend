// Shared FAQ content: rendered in the FAQ section (InfoSections)
// and emitted as FAQPage JSON-LD structured data (layout) for SEO/AEO.
const faqs = [
  {
    question: "What is Jukebox?",
    answer:
      "Jukebox is an autonomous exhibition protocol on Ethereum mainnet. A single NFT is on stage at any moment, visible to everyone. The player who put it there earns $JUKE for every block it stays up — until someone else takes the stage.",
  },
  {
    question: "How do I earn $JUKE?",
    answer:
      "Connect your wallet and take the stage with any NFT — paste an OpenSea URL or enter a contract address and token ID. You accrue 120 $JUKE per Ethereum block while your pick is on view, and the full amount is minted to your wallet when the next player takes the stage.",
  },
  {
    question: "Do I need to own the NFT I play?",
    answer:
      "No. You can put any NFT on Ethereum on stage — ERC-721 or ERC-1155, whether it sits in your wallet or someone else's. You are the player; the artwork can be anyone's.",
  },
  {
    question: "What happens when someone takes the stage from me?",
    answer:
      "Their NFT replaces yours as the piece on view, and everything you accrued — 120 $JUKE per block you held the stage — is minted straight to your wallet in that same transaction.",
  },
  {
    question: "Where can I trade $JUKE?",
    answer:
      "$JUKE is an ERC-20 token on Ethereum mainnet. It trades on Uniswap, and the token contract is verifiable on Etherscan.",
  },
  {
    question: "Is Jukebox open source?",
    answer:
      "Yes. The contract is verified on Etherscan and has no owner or admin functions — nobody can pause it, upgrade it, or take the stage down. The frontend is open source on GitHub for anyone to verify, fork, or build on.",
  },
];

export default faqs;
