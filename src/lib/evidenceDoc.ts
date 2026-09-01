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

const REQUIRED_KEYS: (keyof EvidenceDoc)[] = [
  "agentId",
  "capability",
  "outcome",
  "performedAt",
  "taskDescription",
];

export type VerifyResult = {
  /** true = hash matches; false = document present but hash mismatch or invalid shape. */
  verified: boolean;
  doc: EvidenceDoc | null;
  reason: string;
};

/**
 * Given the raw off-chain JSON text and the on-chain `evidenceHash`, check that
 * `keccak256(canonicalEvidenceJson(parsed)) === expectedHash`.
 *
 * We re-canonicalise the parsed object (not hash the raw bytes) so that formatting
 * differences in how the file was stored don't matter — only the semantic content.
 */
export function parseAndVerify(rawJson: string, expectedHash: string): VerifyResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { verified: false, doc: null, reason: "off-chain document is not valid JSON" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { verified: false, doc: null, reason: "off-chain document is not an object" };
  }
  const doc = parsed as EvidenceDoc;
  const missing = REQUIRED_KEYS.filter((k) => doc[k] === undefined || doc[k] === "");
  if (missing.length) {
    return { verified: false, doc, reason: `missing required fields: ${missing.join(", ")}` };
  }
  const got = evidenceHashOf(doc);
  if (got.toLowerCase() !== expectedHash.toLowerCase()) {
    return { verified: false, doc, reason: `hash mismatch (on-chain ${expectedHash.slice(0, 10)}…, recomputed ${got.slice(0, 10)}…)` };
  }
  return { verified: true, doc, reason: "hash matches on-chain commitment" };
}
