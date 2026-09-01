/**
 * ProofGraph V2 score service — ties the read layer, ERC-8004 signal and scoring
 * engine together. This is what the Day 8 API wraps.
 */
import type { Address } from "viem";

import { resolveAgent, readReputationFeedback, readAgentValidations, ERC8004, VALIDATION_REGISTRY_ABI, publicClient } from "./erc8004";
import { getAgentCapabilityEvidence, verifyAll, type VerifiedEvidence } from "./evidenceV2";
import { scoreEvidence, type ScoreResult, type ScoringEvidence, type Erc8004Signal } from "./score";

export const CAPABILITIES = ["Research", "Coding", "Solidity Audit", "Data Analysis"] as const;
export type Capability = (typeof CAPABILITIES)[number];

export type CapabilityScore = ScoreResult & {
  capability: Capability;
  evidence: VerifiedEvidence[];
};

export type AgentScorecard = {
  agent: { agentId: string; owner: Address; cardUri: string };
  erc8004Signal: Erc8004Signal | null;
  capabilities: CapabilityScore[];
  computedAt: string;
};

/** Heuristic 0..1 normalisation of an ERC-8004 feedback value (scale is client-defined). */
function normFeedback(value: bigint, valueDecimals: number): number {
  const v = Number(value) / 10 ** valueDecimals;
  const scaled = v > 10 ? v / 100 : v > 1 ? v / 10 : v;
  return Math.max(0, Math.min(1, scaled));
}

const VALIDATION_PASS_THRESHOLD = 50; // response uint8 >= 50 counts as a pass

/** Pull an agent's ERC-8004 reputation + validation signal, or null if it has neither. */
export async function getErc8004Signal(agentId: bigint): Promise<Erc8004Signal | null> {
  const [feedback, validationHashes] = await Promise.all([
    readReputationFeedback(agentId).catch(() => []),
    readAgentValidations(agentId).catch(() => [] as readonly `0x${string}`[]),
  ]);

  const live = feedback.filter((f) => !f.revoked);
  const repMean01 =
    live.length > 0
      ? live.reduce((a, f) => a + normFeedback(f.value, f.valueDecimals), 0) / live.length
      : null;

  let validationPassRate: number | null = null;
  if (validationHashes.length > 0) {
    const statuses = await Promise.all(
      validationHashes.map((h) =>
        publicClient
          .readContract({
            address: ERC8004.validationRegistry,
            abi: VALIDATION_REGISTRY_ABI,
            functionName: "getValidationStatus",
            args: [h],
          })
          .catch(() => null),
      ),
    );
    const responses = statuses
      .filter((s): s is readonly unknown[] => Array.isArray(s))
      .map((s) => Number(s[2] as bigint | number)); // (validator, agentId, response, ...)
    if (responses.length > 0) {
      validationPassRate =
        responses.filter((r) => r >= VALIDATION_PASS_THRESHOLD).length / responses.length;
    }
  }

  if (repMean01 === null && validationPassRate === null) return null;
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
  return {
    repMean01: r4(repMean01 ?? 0.5),
    validationPassRate: r4(validationPassRate ?? 0.5),
  };
}

function toScoringEvidence(e: VerifiedEvidence): ScoringEvidence {
  return {
    outcome: e.outcome,
    verifier: e.verifier,
    counterparty: e.counterparty,
    // prefer the off-chain performedAt (may predate the tx); fall back to on-chain ts
    performedAt: e.doc?.performedAt ?? e.at,
  };
}

/** Score one (agentId, capability). */
export async function scoreCapability(
  agentId: bigint,
  capability: Capability,
  opts: {
    now?: string;
    erc8004Signal?: Erc8004Signal | null;
    verify?: boolean;
    evidenceBaseUrl?: string;
  } = {},
): Promise<CapabilityScore> {
  const now = opts.now ?? new Date().toISOString();
  const raw = await getAgentCapabilityEvidence(agentId, capability);
  const evidence =
    opts.verify === false ? raw.map(asUnverified) : await verifyAll(raw, { baseUrl: opts.evidenceBaseUrl });
  const signal =
    opts.erc8004Signal !== undefined ? opts.erc8004Signal : await getErc8004Signal(agentId);

  const result = scoreEvidence(evidence.map(toScoringEvidence), {
    now,
    erc8004Signal: signal ?? undefined,
  });
  return { ...result, capability, evidence };
}

function asUnverified(e: import("./evidenceV2").EvidenceV2): VerifiedEvidence {
  return { ...e, verified: null, verifyReason: "not checked", doc: null };
}

/** Full scorecard: identity + all four capability scores. */
export async function getAgentScorecard(
  agentId: bigint,
  opts: { now?: string; verify?: boolean; evidenceBaseUrl?: string } = {},
): Promise<AgentScorecard> {
  const now = opts.now ?? new Date().toISOString();
  const [agent, erc8004Signal] = await Promise.all([resolveAgent(agentId), getErc8004Signal(agentId)]);
  const capabilities = await Promise.all(
    CAPABILITIES.map((c) =>
      scoreCapability(agentId, c, {
        now,
        erc8004Signal,
        verify: opts.verify,
        evidenceBaseUrl: opts.evidenceBaseUrl,
      }),
    ),
  );
  return {
    agent: { agentId: agent.agentId.toString(), owner: agent.owner, cardUri: agent.cardUri },
    erc8004Signal,
    capabilities,
    computedAt: now,
  };
}

export function isCapability(x: string): x is Capability {
  return (CAPABILITIES as readonly string[]).includes(x);
}

// --- API response shaping (SPEC §4) -----------------------------------------

function shapeEvidence(list: VerifiedEvidence[]) {
  return list.map((e) => ({
    id: e.id,
    source: "EvidenceRegistryV2",
    capability: e.capability,
    outcome: e.outcome,
    verifier: e.verifier,
    counterparty: e.counterparty,
    at: e.at,
    performedAt: e.doc?.performedAt ?? null,
    uri: e.uri,
    evidenceHash: e.evidenceHash,
    verified: e.verified,
    verifyReason: e.verifyReason,
  }));
}

function shapeScore(c: CapabilityScore) {
  const { successes, failures } = c.counts;
  const completed = successes + failures;
  const lastAt = c.evidence
    .map((e) => e.doc?.performedAt ?? e.at)
    .sort()
    .at(-1);
  return {
    capability: c.capability,
    score: c.score,
    confidence: c.confidence,
    penalty: c.penalty,
    counts: {
      evidence: c.counts.total,
      verifiers: c.counts.distinctVerifiers,
      counterparties: c.counts.distinctCounterparties,
      successes,
      failures,
      disputed: c.counts.disputed,
    },
    successRate: completed > 0 ? successes / completed : null,
    lastEvidenceAt: lastAt ?? null,
    reasons: c.reasons,
    terms: c.terms,
    evidence: shapeEvidence(c.evidence),
  };
}

/** SPEC §4 — GET /v2/api/score?agent=&capability= */
export async function scoreCapabilityApi(
  agentId: bigint,
  capability: Capability,
  now: string,
  evidenceBaseUrl?: string,
) {
  const [agent, erc8004Signal] = await Promise.all([resolveAgent(agentId), getErc8004Signal(agentId)]);
  const c = await scoreCapability(agentId, capability, { now, erc8004Signal, evidenceBaseUrl });
  return {
    agent: { agentId: agent.agentId.toString(), address: agent.owner, cardUri: agent.cardUri },
    erc8004Signal,
    ...shapeScore(c),
    formulaVersion: c.formulaVersion,
    computedAt: now,
  };
}

/** SPEC §4 — GET /v2/api/agents/:id */
export async function agentScorecardApi(agentId: bigint, now: string, evidenceBaseUrl?: string) {
  const card = await getAgentScorecard(agentId, { now, evidenceBaseUrl });
  return {
    agent: card.agent,
    erc8004Signal: card.erc8004Signal,
    capabilities: card.capabilities.map(shapeScore),
    formulaVersion: card.capabilities[0]?.formulaVersion ?? "v2.0",
    computedAt: card.computedAt,
  };
}
