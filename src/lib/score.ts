/**
 * ProofGraph V2 task-aware scoring engine — FROZEN formula v2.0 (see SPEC.md §3).
 *
 * Pure and deterministic: no network, no `Date.now()`. The caller filters evidence to a
 * single (agentId, capability), passes `now`, and optionally a pre-fetched ERC-8004 signal.
 */

export const FORMULA_VERSION = "v2.0";

export type Outcome = "Success" | "Failure" | "Disputed";

export type ScoringEvidence = {
  outcome: Outcome;
  verifier: string;
  counterparty: string; // 0x000…0 = undisclosed
  /** ISO timestamp the work was performed (off-chain doc, falling back to on-chain ts). */
  performedAt: string;
};

export type Erc8004Signal = {
  /** mean ERC-8004 feedback value normalised to 0..1 */
  repMean01: number;
  /** passed / total ValidationResponse for the agent */
  validationPassRate: number;
};

export type Confidence = "none" | "low" | "medium" | "high";

export type ScoreTerm = {
  key: "success" | "verifier" | "volume" | "recency" | "counterparty" | "erc8004";
  value: number; // 0..1
  weight: number;
  applicable: boolean;
  /** normalised contribution to the final base (0 when not applicable) */
  contribution: number;
};

export type ScoreResult = {
  score: number; // 0..100
  confidence: Confidence;
  formulaVersion: string;
  penalty: number; // 0..0.20
  counts: {
    total: number;
    successes: number;
    failures: number;
    disputed: number;
    completed: number;
    distinctVerifiers: number;
    distinctCounterparties: number;
  };
  terms: ScoreTerm[];
  reasons: string[];
};

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const HALF_LIFE_DAYS = 45;
const DISPUTE_PENALTY = 0.2;
const WEIGHTS = {
  success: 0.45,
  verifier: 0.2,
  volume: 0.13,
  recency: 0.12,
  counterparty: 0.05,
  erc8004: 0.05,
} as const;

function f2(n: number): string {
  return n.toFixed(2);
}

export function scoreEvidence(
  evidence: ScoringEvidence[],
  opts: { now: string | number | Date; erc8004Signal?: Erc8004Signal },
): ScoreResult {
  const total = evidence.length;
  const successes = evidence.filter((e) => e.outcome === "Success").length;
  const failures = evidence.filter((e) => e.outcome === "Failure").length;
  const disputed = evidence.filter((e) => e.outcome === "Disputed").length;
  const completed = successes + failures;

  const distinctVerifiers = new Set(evidence.map((e) => e.verifier.toLowerCase())).size;
  const disclosedCps = evidence
    .map((e) => e.counterparty.toLowerCase())
    .filter((c) => c !== ZERO_ADDR);
  const distinctCounterparties = new Set(disclosedCps).size;

  const counts = {
    total,
    successes,
    failures,
    disputed,
    completed,
    distinctVerifiers,
    distinctCounterparties,
  };

  if (total === 0) {
    return {
      score: 0,
      confidence: "none",
      formulaVersion: FORMULA_VERSION,
      penalty: 0,
      counts,
      terms: [],
      reasons: ["No evidence for this agent + capability."],
    };
  }

  const nowMs = new Date(opts.now).getTime();
  const freshness =
    evidence.reduce((acc, e) => {
      const ageDays = Math.max(0, (nowMs - new Date(e.performedAt).getTime()) / 86_400_000);
      return acc + Math.exp(-ageDays / HALF_LIFE_DAYS);
    }, 0) / total;

  const successValue = (successes + 2) / (completed + 4); // Beta(2,2) shrinkage
  const verifierValue = Math.min(distinctVerifiers, 4) / 4;
  const volumeValue = Math.min(total, 8) / 8;
  const counterpartyValue = Math.min(distinctCounterparties, 3) / 3;
  const sig = opts.erc8004Signal;
  const erc8004Value = sig ? 0.6 * clamp01(sig.repMean01) + 0.4 * clamp01(sig.validationPassRate) : 0;

  const rawTerms: Omit<ScoreTerm, "contribution">[] = [
    { key: "success", value: successValue, weight: WEIGHTS.success, applicable: true },
    { key: "verifier", value: verifierValue, weight: WEIGHTS.verifier, applicable: true },
    { key: "volume", value: volumeValue, weight: WEIGHTS.volume, applicable: true },
    { key: "recency", value: freshness, weight: WEIGHTS.recency, applicable: true },
    {
      key: "counterparty",
      value: counterpartyValue,
      weight: WEIGHTS.counterparty,
      applicable: distinctCounterparties > 0,
    },
    { key: "erc8004", value: erc8004Value, weight: WEIGHTS.erc8004, applicable: Boolean(sig) },
  ];

  const activeWeight = rawTerms.filter((t) => t.applicable).reduce((a, t) => a + t.weight, 0);
  const terms: ScoreTerm[] = rawTerms.map((t) => ({
    ...t,
    contribution: t.applicable ? (t.value * t.weight) / activeWeight : 0,
  }));

  const base = terms.reduce((a, t) => a + t.contribution, 0);
  const penalty = (disputed / total) * DISPUTE_PENALTY;
  const score = Math.round(100 * base * (1 - penalty));

  const confidence: Confidence =
    total < 3 || distinctVerifiers < 2
      ? "low"
      : total < 6 || distinctVerifiers < 3
        ? "medium"
        : "high";

  return {
    score,
    confidence,
    formulaVersion: FORMULA_VERSION,
    penalty,
    counts,
    terms,
    reasons: buildReasons(terms, counts, freshness, successValue, penalty, confidence),
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function buildReasons(
  terms: ScoreTerm[],
  c: ScoreResult["counts"],
  freshness: number,
  successValue: number,
  penalty: number,
  confidence: Confidence,
): string[] {
  const by = (k: ScoreTerm["key"]) => terms.find((t) => t.key === k)!;
  const out: string[] = [];

  out.push(
    `Smoothed success rate ${f2(successValue)} — ${c.successes} success / ${c.failures} failure (Beta(2,2) prior)`,
  );
  out.push(`${c.distinctVerifiers} independent verifier(s) (${f2(by("verifier").value)} of cap 4)`);
  out.push(`Evidence volume ${c.total} / 8`);
  out.push(`Average freshness ${f2(freshness)} (45-day half-life)`);

  const cp = by("counterparty");
  out.push(
    cp.applicable
      ? `${c.distinctCounterparties} distinct counterpart(y/ies) (${f2(cp.value)} of cap 3)`
      : "Counterparty diversity not assessed — no counterparties disclosed",
  );

  const e = by("erc8004");
  out.push(
    e.applicable
      ? `ERC-8004 reputation/validation signal ${f2(e.value)}`
      : "No ERC-8004 reputation signal for this agent",
  );

  if (penalty > 0) {
    out.push(`${c.disputed} of ${c.total} outcome(s) disputed → score x${f2(1 - penalty)}`);
  }
  out.push(
    `Confidence: ${confidence} (${c.total} record(s), ${c.distinctVerifiers} verifier(s))`,
  );
  return out;
}
