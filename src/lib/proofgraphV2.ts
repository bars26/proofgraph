/**
 * ProofGraph V2 score service — ties the read layer, ERC-8004 signal and scoring
 * engine together. This is what the Day 8 API wraps.
 */
import type { Address } from "viem";

import {
  resolveAgent,
  readReputationSummary,
  readValidationHistory,
  type ReputationSummary,
  type ValidationRecord,
} from "./erc8004";
import { fetchAgentCard, type AgentCardResult } from "./agentCard";
import { getAgentCapabilityEvidence, verifyAll, type VerifiedEvidence } from "./evidenceV2";
import { scoreEvidence, type ScoreResult, type ScoringEvidence, type Erc8004Signal } from "./score";

export const CAPABILITIES = ["Research", "Coding", "Solidity Audit", "Data Analysis"] as const;
export type Capability = (typeof CAPABILITIES)[number];

export type CapabilityScore = ScoreResult & {
  capability: Capability;
  evidence: VerifiedEvidence[];
};

export type AgentScorecard = {
  agent: { agentId: string; owner: Address; cardUri: string; card: AgentCardResult };
  erc8004: Erc8004Profile;
  capabilities: CapabilityScore[];
  computedAt: string;
};

const VALIDATION_PASS_THRESHOLD = 50; // response uint8 >= 50 counts as a pass
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export type Erc8004Profile = {
  signal: Erc8004Signal | null;
  reputation: ReputationSummary;
  validations: ValidationRecord[];
};

/** One fetch of everything ProofGraph reads from ERC-8004 for an agent. */
export async function getErc8004Profile(agentId: bigint): Promise<Erc8004Profile> {
  const [reputation, validations] = await Promise.all([
    readReputationSummary(agentId),
    readValidationHistory(agentId),
  ]);

  // a request with no response yet has response 0 and an empty tag — exclude those
  const answered = validations.filter((v) => v.tag !== "" || v.response > 0);
  const validationPassRate =
    answered.length > 0
      ? answered.filter((v) => v.response >= VALIDATION_PASS_THRESHOLD).length / answered.length
      : null;

  const signal: Erc8004Signal | null =
    reputation.meanValue01 === null && validationPassRate === null
      ? null
      : {
          repMean01: r4(reputation.meanValue01 ?? 0.5),
          validationPassRate: r4(validationPassRate ?? 0.5),
        };

  return { signal, reputation, validations };
}

/** Just the scoring input (kept for callers that don't need the full profile). */
export async function getErc8004Signal(agentId: bigint): Promise<Erc8004Signal | null> {
  return (await getErc8004Profile(agentId)).signal;
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
  const [agent, erc8004] = await Promise.all([resolveAgent(agentId), getErc8004Profile(agentId)]);
  const [card, capabilities] = await Promise.all([
    fetchAgentCard(agent.cardUri),
    Promise.all(
      CAPABILITIES.map((c) =>
        scoreCapability(agentId, c, {
          now,
          erc8004Signal: erc8004.signal,
          verify: opts.verify,
          evidenceBaseUrl: opts.evidenceBaseUrl,
        }),
      ),
    ),
  ]);
  return {
    agent: { agentId: agent.agentId.toString(), owner: agent.owner, cardUri: agent.cardUri, card },
    erc8004,
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
  const [agent, erc8004] = await Promise.all([resolveAgent(agentId), getErc8004Profile(agentId)]);
  const [card, c] = await Promise.all([
    fetchAgentCard(agent.cardUri),
    scoreCapability(agentId, capability, { now, erc8004Signal: erc8004.signal, evidenceBaseUrl }),
  ]);
  return {
    agent: {
      agentId: agent.agentId.toString(),
      address: agent.owner,
      cardUri: agent.cardUri,
      card,
    },
    erc8004: {
      signal: erc8004.signal,
      reputation: erc8004.reputation,
      validations: erc8004.validations,
    },
    ...shapeScore(c),
    formulaVersion: c.formulaVersion,
    computedAt: now,
  };
}

/** SPEC §4 — GET /v2/api/agents/:id */
export async function agentScorecardApi(agentId: bigint, now: string, evidenceBaseUrl?: string) {
  const sc = await getAgentScorecard(agentId, { now, evidenceBaseUrl });
  return {
    agent: sc.agent,
    erc8004: sc.erc8004,
    capabilities: sc.capabilities.map(shapeScore),
    formulaVersion: sc.capabilities[0]?.formulaVersion ?? "v2.0",
    computedAt: sc.computedAt,
  };
}
