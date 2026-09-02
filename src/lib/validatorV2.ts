/**
 * ProofGraph as an ERC-8004 Validation Registry validator.
 *
 * ProofGraph's on-chain identity is agentId 889819 (Agent Card at agent-card.json);
 * its operating wallet is the ARC_PRIVATE_KEY account. When another party calls
 * `validationRequest(proofgraphAddress, agentId, requestURI, requestHash)`, ProofGraph
 * computes the task-aware score and answers with `validationResponse(...)`.
 *
 * The signing wallet must be passed in (keystore-held); this module never touches keys.
 */
import { keccak256, toBytes, getContract, type Address, type WalletClient } from "viem";

import { ERC8004, VALIDATION_REGISTRY_ABI, publicClient } from "./erc8004";
import { scoreCapability, isCapability, type Capability } from "./proofgraphV2";

export const PROOFGRAPH_VALIDATOR = {
  agentId: 889819n,
  address: "0x4F80B5c475fcEd34fc9A07FfCcF39E1Adc1406bf" as Address,
  cardUri: "https://proofgraph-gamma.vercel.app/agent-card.json",
} as const;

export type ScoreAttestation = {
  agentId: string;
  capability: Capability;
  score: number;
  confidence: string;
  formulaVersion: string;
  evidenceHashes: string[];
  computedAt: string;
};

export function attestationHash(a: ScoreAttestation): `0x${string}` {
  return keccak256(toBytes(JSON.stringify(a, Object.keys(a).sort())));
}

/** Parse `?agent=&capability=` out of a request URI. */
export function parseRequestURI(uri: string): { agentId?: bigint; capability?: Capability } {
  try {
    const u = new URL(uri);
    const a = u.searchParams.get("agent");
    const c = u.searchParams.get("capability");
    return {
      agentId: a && /^\d+$/.test(a) ? BigInt(a) : undefined,
      capability: c && isCapability(c) ? c : undefined,
    };
  } catch {
    return {};
  }
}

export type ValidationResult = {
  requestHash: `0x${string}`;
  txHash: `0x${string}`;
  response: number;
  confidence: string;
  responseURI: string;
  responseHash: `0x${string}`;
  attestation: ScoreAttestation;
};

/**
 * Compute the task-aware score for (agentId, capability) and publish it to the
 * ValidationRegistry as the response to `requestHash`. `wallet` must be ProofGraph's
 * validator account.
 */
export async function respondToValidation(params: {
  wallet: WalletClient;
  requestHash: `0x${string}`;
  agentId: bigint;
  capability: Capability;
  now?: string;
  baseUrl?: string;
}): Promise<ValidationResult> {
  const now = params.now ?? new Date().toISOString();
  const base = (params.baseUrl ?? PROOFGRAPH_VALIDATOR.cardUri.replace("/agent-card.json", "")).replace(/\/$/, "");

  const c = await scoreCapability(params.agentId, params.capability, {
    now,
    evidenceBaseUrl: params.baseUrl,
  });

  const attestation: ScoreAttestation = {
    agentId: params.agentId.toString(),
    capability: params.capability,
    score: c.score,
    confidence: c.confidence,
    formulaVersion: c.formulaVersion,
    evidenceHashes: c.evidence.map((e) => e.evidenceHash),
    computedAt: now,
  };
  const responseHash = attestationHash(attestation);
  const responseURI = `${base}/v2/api/score?agent=${params.agentId}&capability=${encodeURIComponent(params.capability)}`;
  const response = Math.max(0, Math.min(255, c.score)); // uint8

  const registry = getContract({
    address: ERC8004.validationRegistry,
    abi: VALIDATION_REGISTRY_ABI,
    client: params.wallet,
  });

  const txHash = (await registry.write.validationResponse([
    params.requestHash,
    response,
    responseURI,
    responseHash,
    params.capability,
  ])) as `0x${string}`;

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    requestHash: params.requestHash,
    txHash,
    response,
    confidence: c.confidence,
    responseURI,
    responseHash,
    attestation,
  };
}
