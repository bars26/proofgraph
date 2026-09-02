/**
 * ProofGraph V2 evidence — read layer over the EvidenceRegistryV2 contract on Arc Testnet.
 *
 * No event/getLogs scanning (the public RPC prunes history): the contract exposes
 * `evidenceCount` + `getEvidenceBatch`, so we read state directly.
 */
import { type Address, getContract } from "viem";

import { arcTestnet, publicClient } from "./erc8004";
import { parseAndVerify, type EvidenceDoc } from "./evidenceDoc";
import evidenceV2AbiJson from "./abis/evidenceRegistryV2.json" with { type: "json" };
import type { Abi } from "viem";

export const EVIDENCE_REGISTRY_V2_ABI = evidenceV2AbiJson as Abi;

export const OUTCOME = ["Success", "Failure", "Disputed"] as const;
export type Outcome = (typeof OUTCOME)[number];

export type EvidenceV2 = {
  id: number;
  agentId: string; // uint256 as decimal string
  capability: string;
  outcome: Outcome;
  counterparty: Address; // 0x000… = undisclosed
  evidenceHash: `0x${string}`;
  uri: string;
  verifier: Address;
  timestamp: number; // unix seconds
  at: string; // ISO
};

/** The live Arc Testnet deployment (Day 3). Env var overrides it for local/other deploys. */
export const EVIDENCE_REGISTRY_V2_DEFAULT: Address =
  "0x99848Ff9527C38c371D5c892a00677b90387aF4a";

export function evidenceRegistryV2Address(): Address {
  return (process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_V2 as Address) ?? EVIDENCE_REGISTRY_V2_DEFAULT;
}

function contract(address?: Address) {
  return getContract({
    address: address ?? evidenceRegistryV2Address(),
    abi: EVIDENCE_REGISTRY_V2_ABI,
    client: publicClient,
  });
}

type RawEvidence = {
  id: bigint;
  agentId: bigint;
  capability: string;
  outcome: number;
  counterparty: Address;
  evidenceHash: `0x${string}`;
  uri: string;
  verifier: Address;
  timestamp: bigint;
};

function normalize(e: RawEvidence): EvidenceV2 {
  const ts = Number(e.timestamp);
  return {
    id: Number(e.id),
    agentId: e.agentId.toString(),
    capability: e.capability,
    outcome: OUTCOME[e.outcome] ?? "Disputed",
    counterparty: e.counterparty,
    evidenceHash: e.evidenceHash,
    uri: e.uri,
    verifier: e.verifier,
    timestamp: ts,
    at: new Date(ts * 1000).toISOString(),
  };
}

async function batch(ids: bigint[], address?: Address): Promise<EvidenceV2[]> {
  if (ids.length === 0) return [];
  const rows = (await contract(address).read.getEvidenceBatch([ids])) as readonly RawEvidence[];
  return rows.map(normalize);
}

/** Every evidence record in the registry (1-indexed, read in one batched call). */
export async function getAllEvidence(address?: Address): Promise<EvidenceV2[]> {
  const count = (await contract(address).read.evidenceCount()) as bigint;
  if (count === 0n) return [];
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
  return batch(ids, address);
}

/** All evidence for one ERC-8004 agentId. */
export async function getAgentEvidence(agentId: bigint, address?: Address): Promise<EvidenceV2[]> {
  const ids = (await contract(address).read.getAgentEvidenceIds([agentId])) as readonly bigint[];
  return batch([...ids], address);
}

/** Evidence for one agentId filtered to a single capability. */
export async function getAgentCapabilityEvidence(
  agentId: bigint,
  capability: string,
  address?: Address,
): Promise<EvidenceV2[]> {
  const ids = (await contract(address).read.getAgentCapabilityEvidenceIds([
    agentId,
    capability,
  ])) as readonly bigint[];
  return batch([...ids], address);
}

// --- off-chain verification --------------------------------------------------

export type VerifiedEvidence = EvidenceV2 & {
  /** true = hash matches; false = fetched but tampered/invalid; null = could not fetch. */
  verified: boolean | null;
  verifyReason: string;
  doc: EvidenceDoc | null;
};

/**
 * Rewrite the stored `uri` origin. Explicit `baseUrl` wins; otherwise
 * `PROOFGRAPH_EVIDENCE_BASE_URL` (seed URIs point at the production host; dev points local).
 */
function resolveUri(uri: string, baseUrl?: string): string {
  const base = baseUrl ?? process.env.PROOFGRAPH_EVIDENCE_BASE_URL;
  if (!base) return uri;
  try {
    const u = new URL(uri);
    return `${base.replace(/\/$/, "")}${u.pathname}`;
  } catch {
    return uri;
  }
}

/** Fetch one evidence record's off-chain doc and check it against the on-chain hash. */
export async function verifyEvidence(
  e: EvidenceV2,
  opts: { fetchImpl?: typeof fetch; baseUrl?: string } = {},
): Promise<VerifiedEvidence> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let raw: string;
  try {
    const res = await fetchImpl(resolveUri(e.uri, opts.baseUrl));
    if (!res.ok) {
      return { ...e, verified: null, verifyReason: `fetch failed: HTTP ${res.status}`, doc: null };
    }
    raw = await res.text();
  } catch (err) {
    return { ...e, verified: null, verifyReason: `fetch error: ${(err as Error).message}`, doc: null };
  }
  const r = parseAndVerify(raw, e.evidenceHash);
  return { ...e, verified: r.verified, verifyReason: r.reason, doc: r.doc };
}

/** Verify a list of evidence records (bounded concurrency). */
export async function verifyAll(
  list: EvidenceV2[],
  opts: { concurrency?: number; baseUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<VerifiedEvidence[]> {
  const concurrency = opts.concurrency ?? 6;
  const out: VerifiedEvidence[] = [];
  for (let i = 0; i < list.length; i += concurrency) {
    out.push(
      ...(await Promise.all(
        list.slice(i, i + concurrency).map((e) =>
          verifyEvidence(e, { baseUrl: opts.baseUrl, fetchImpl: opts.fetchImpl }),
        ),
      )),
    );
  }
  return out;
}

export { arcTestnet };
