/**
 * ERC-8004 registries on Arc Testnet.
 *
 * Day 1: addresses verified on-chain (eth_getCode + eth_call). See DECISIONS.md §1.
 *   - IdentityRegistry is a live ERC-721: name() = "AgentIdentity", symbol() = "AGENT".
 *   - Reputation / Validation ABIs below are DERIVED FROM DOCS and NOT YET VERIFIED.
 *     Day 2: replace `*_ABI_UNVERIFIED` with ABIs pulled from arcscan / erc-8004/erc-8004-contracts.
 */
import { createPublicClient, http, defineChain, type Address } from "viem";

export const ARC_TESTNET_RPC = "https://rpc.testnet.arc.network";
export const ARC_TESTNET_CHAIN_ID = 5042002;
export const ARCSCAN_API_URL = "https://testnet.arcscan.app/api";

export const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_TESTNET_RPC] } },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
});

export const ERC8004 = {
  identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address,
  reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as Address,
  validationRegistry: "0x8004Cb1BF31DAf7788923b405b754f57acEB4272" as Address,
} as const;

/** Verified: standard ERC-721 reads work on IdentityRegistry. */
export const IDENTITY_REGISTRY_ABI = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "tokenURI", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "string" }] },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
  // TODO Day 2: add register(...) + the registration/metadata events (topics observed:
  //   0xca52e62c…, 0x2c149ed5…, 0xf8e1a15a… — decode against verified ABI).
] as const;

// TODO Day 2 — replace with verified ABI. Observed feedback event topic: 0x6a4a6174…
export const REPUTATION_REGISTRY_ABI_UNVERIFIED = [] as const;

// TODO Day 2 — replace with verified ABI. Observed topics: request 0x530436c3…, response 0xafddf629…
export const VALIDATION_REGISTRY_ABI_UNVERIFIED = [] as const;

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

/** Resolve an ERC-8004 agent identity. */
export async function resolveAgent(agentId: bigint): Promise<{
  agentId: bigint;
  owner: Address;
  cardUri: string;
}> {
  const [owner, cardUri] = await Promise.all([
    publicClient.readContract({
      address: ERC8004.identityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "ownerOf",
      args: [agentId],
    }),
    publicClient.readContract({
      address: ERC8004.identityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "tokenURI",
      args: [agentId],
    }),
  ]);
  return { agentId, owner, cardUri };
}

// TODO Day 9: readReputationSignal(agentId), readValidationHistory(agentId)
// TODO Target: publishValidationResponse(requestHash, status, ...) via server signer
