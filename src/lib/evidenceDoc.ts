/**
 * Off-chain evidence document — canonical form + hash.
 *
 * The on-chain `evidenceHash` is `keccak256(bytes(canonicalEvidenceJson(doc)))`.
 * Seed script and the read/verify path MUST use this same function so hashes match.
 */
import { keccak256, toBytes } from "viem";

export type EvidenceDoc = {
  /** ERC-8004 agentId this evidence is about. */
  agentId: string;
  capability: string;
  outcome: "Success" | "Failure" | "Disputed";
  /** ISO date the work was actually performed (used for recency; may predate the tx). */
  performedAt: string;
  /** Short human description of the task. */
  taskDescription: string;
  /** Optional links/refs backing the claim. */
  artifacts?: string[];
  /** Free-text note from the verifier. */
  verifierNote?: string;
  /** Where the work/verification originated (e.g. "x402", "ERC-8183", "manual"). */
  sourceRef?: string;
};

/**
 * Deterministic JSON: keys sorted, no insignificant whitespace.
 * Any change here is a breaking change to every stored hash — bump with care.
 */
export function canonicalEvidenceJson(doc: EvidenceDoc): string {
  return JSON.stringify(doc, Object.keys(doc).sort());
}

export function evidenceHashOf(doc: EvidenceDoc): `0x${string}` {
  return keccak256(toBytes(canonicalEvidenceJson(doc)));
}
