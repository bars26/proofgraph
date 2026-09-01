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

export type ValidationRecord = {
  requestHash: `0x${string}`;
  validator: Address;
  agentId: string;
  response: number; // uint8
  responseHash: `0x${string}`;
  tag: string;
  lastUpdate: number; // unix seconds
};

/** Full validation history for an agent (request hash + resolved response). */
export async function readValidationHistory(agentId: bigint): Promise<ValidationRecord[]> {
  const hashes = await readAgentValidations(agentId).catch(() => [] as readonly `0x${string}`[]);
  if (hashes.length === 0) return [];
  const rows = await Promise.all(
    hashes.map(async (h) => {
      try {
        const s = (await publicClient.readContract({
          address: ERC8004.validationRegistry,
          abi: VALIDATION_REGISTRY_ABI,
          functionName: "getValidationStatus",
          args: [h],
        })) as readonly [Address, bigint, number | bigint, `0x${string}`, string, bigint];
        return {
          requestHash: h,
          validator: s[0],
          agentId: s[1].toString(),
          response: Number(s[2]),
          responseHash: s[3],
          tag: s[4],
          lastUpdate: Number(s[5]),
        } satisfies ValidationRecord;
      } catch {
        return null;
      }
    }),
  );
  return rows.filter((r): r is ValidationRecord => r !== null);
}

export type ReputationSummary = {
  total: number;
  revoked: number;
  active: number;
  /** mean of active NewFeedback.value normalised to 0..1 */
  meanValue01: number | null;
  /** histogram of tag1 labels over active feedback */
  tags: Record<string, number>;
};

/** Aggregate an agent's ERC-8004 reputation feedback. */
export async function readReputationSummary(agentId: bigint): Promise<ReputationSummary> {
  const rows = await readReputationFeedback(agentId).catch(() => []);
  const active = rows.filter((r) => !r.revoked);
  const tags: Record<string, number> = {};
  for (const r of active) {
    const t = r.tag1 || "(none)";
    tags[t] = (tags[t] ?? 0) + 1;
  }
  const norm = active.map((r) => {
    const v = Number(r.value) / 10 ** r.valueDecimals;
    const scaled = v > 10 ? v / 100 : v > 1 ? v / 10 : v;
    return Math.max(0, Math.min(1, scaled));
  });
  const mean = norm.length ? norm.reduce((a, b) => a + b, 0) / norm.length : null;
  return {
    total: rows.length,
    revoked: rows.length - active.length,
    active: active.length,
    meanValue01: mean === null ? null : Math.round(mean * 1e4) / 1e4,
    tags,
  };
}

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/**
 * Resolve a user-supplied `agent` param to an ERC-8004 agentId.
 * Numeric string -> that id. 0x-address -> the agent(s) they minted, lowest id first
 * (looked up via the explorer API since the public RPC prunes history).
 */
export async function resolveAgentId(input: string): Promise<bigint> {
  const s = input.trim();
  if (/^\d+$/.test(s)) return BigInt(s);
  if (!/^0x[0-9a-fA-F]{40}$/.test(s)) {
    throw new Error(`"${input}" is neither a numeric agentId nor a 0x address`);
  }
  const owner = "0x" + "".padStart(24, "0") + s.slice(2).toLowerCase(); // 32-byte topic
  const url =
    `${ARCSCAN_API_URL}?module=logs&action=getLogs&fromBlock=0&toBlock=latest` +
    `&address=${ERC8004.identityRegistry}&topic0=${TRANSFER_TOPIC}` +
    `&topic0_2_opr=and&topic2=${owner}`;
  const res = await fetch(url);
  const body = (await res.json()) as { result?: Array<{ topics: string[] }> };
  const mints = (body.result ?? []).filter((l) => l.topics?.[1] && BigInt(l.topics[1]) === 0n);
  if (mints.length === 0) throw new Error(`no ERC-8004 agent minted by ${s}`);
  const ids = [...new Set(mints.map((l) => BigInt(l.topics[3])))].sort((a, b) => (a < b ? -1 : 1));
  if (ids.length > 1) {
    throw new Error(
      `${s} owns multiple agents [${ids.join(", ")}] — pass a numeric agentId instead`,
    );
  }
  return ids[0];
}

// TODO Day 9: fold reputation + validation into scoring `erc8004Signal`
// TODO Target: publishValidationResponse(requestHash, response, uri, hash, tag) via server signer
