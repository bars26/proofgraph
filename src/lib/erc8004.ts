/**
 * ERC-8004 registries on Arc Testnet.
 *
 * Day 1: addresses verified on-chain. Day 2: real ABIs pulled from arcscan.
 * All three registries are ERC1967 proxies; ABIs in ./abis/*.json are the
 * *implementation* ABIs (IdentityRegistryUpgradeable / ReputationRegistryUpgradeable /
 * ValidationRegistryUpgradeable). See DECISIONS.md §1 for impl addresses.
 */
import { createPublicClient, http, defineChain, type Address, type Abi } from "viem";

import identityAbiJson from "./abis/identityRegistry.json" with { type: "json" };
import reputationAbiJson from "./abis/reputationRegistry.json" with { type: "json" };
import validationAbiJson from "./abis/validationRegistry.json" with { type: "json" };

export const IDENTITY_REGISTRY_ABI = identityAbiJson as Abi;
export const REPUTATION_REGISTRY_ABI = reputationAbiJson as Abi;
export const VALIDATION_REGISTRY_ABI = validationAbiJson as Abi;

export const ARC_TESTNET_RPC = "https://rpc.testnet.arc.network";
export const ARC_TESTNET_CHAIN_ID = 5042002;
export const ARCSCAN_API_URL = "https://testnet.arcscan.app/api";

export const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_TESTNET_RPC] } },
  blockExplorers: { default: { name: "Arcscan", url: "https://testnet.arcscan.app" } },
});

/** Proxy addresses (what you call). */
export const ERC8004 = {
  identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address,
  reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as Address,
  validationRegistry: "0x8004Cb1BF31DAf7788923b405b754f57acEB4272" as Address,
} as const;

export const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });

/** Resolve an ERC-8004 agent identity from the IdentityRegistry. */
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
    }) as Promise<Address>,
    publicClient.readContract({
      address: ERC8004.identityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "tokenURI",
      args: [agentId],
    }) as Promise<string>,
  ]);
  return { agentId, owner, cardUri };
}

/**
 * Read every feedback row for an agent from the ReputationRegistry.
 * Signature (verified):
 *   readAllFeedback(agentId, clientAddresses[], tag1, tag2, includeRevoked)
 *     -> (address[] clients, uint64[] indexes, int128[] values, uint8[] decimals,
 *         string[] tag1s, string[] tag2s, bool[] revoked)
 * Passing empty arrays / empty tags = no filter.
 */
export async function readReputationFeedback(agentId: bigint) {
  const res = (await publicClient.readContract({
    address: ERC8004.reputationRegistry,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: "readAllFeedback",
    args: [agentId, [], "", "", false],
  })) as readonly [
    readonly Address[],
    readonly bigint[],
    readonly bigint[],
    readonly number[],
    readonly string[],
    readonly string[],
    readonly boolean[],
  ];
  const [clients, indexes, values, decimals, tag1s, tag2s, revoked] = res;
  return clients.map((client, i) => ({
    client,
    feedbackIndex: indexes[i],
    value: values[i],
    valueDecimals: decimals[i],
    tag1: tag1s[i],
    tag2: tag2s[i],
    revoked: revoked[i],
  }));
}

/** Validation request hashes recorded for an agent. */
export async function readAgentValidations(agentId: bigint): Promise<readonly `0x${string}`[]> {
  return (await publicClient.readContract({
    address: ERC8004.validationRegistry,
    abi: VALIDATION_REGISTRY_ABI,
    functionName: "getAgentValidations",
    args: [agentId],
  })) as readonly `0x${string}`[];
}

// TODO Day 9: fold reputation + validation into scoring `erc8004Signal`
// TODO Target: publishValidationResponse(requestHash, response, uri, hash, tag) via server signer
