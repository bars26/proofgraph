/**
 * Hand-crafted scoring fixtures — frozen Day 5, consumed by the Day 6 engine tests.
 *
 * Deterministic: fixed `NOW`, no live ERC-8004 signal unless a fixture sets one.
 * Assertions are bands + ordering, not exact points (see SPEC.md §3).
 */

export type ScoringInput = {
  outcome: "Success" | "Failure" | "Disputed";
  verifier: `0x${string}`;
  counterparty: `0x${string}`;
  performedAt: string; // ISO
};

export type Erc8004Signal = { repMean01: number; validationPassRate: number };

export type ScoringFixture = {
  name: string;
  now: string;
  evidence: ScoringInput[];
  erc8004Signal?: Erc8004Signal;
  expect: {
    scoreMin: number;
    scoreMax: number;
    confidence: "none" | "low" | "medium" | "high";
  };
};

export const NOW = "2026-09-02T00:00:00.000Z";

const A = "0xAAaAAaaAAaaaAaAaAAAaAAaaAAAAAaAAaaAaaAAA0" as const;
const B = "0xBbBBBbbbBBBbbbbbBbBbBBBBBbBbbBBbBbBbBbBB0" as const;
const C = "0xCccCCCcCcCCcCCCCCcCCccCccCccCCcCcccCCCcC0" as const;
const ZERO = "0x0000000000000000000000000000000000000000" as const;

function daysAgo(n: number): string {
  return new Date(Date.parse(NOW) - n * 86_400_000).toISOString();
}

function ev(
  outcome: ScoringInput["outcome"],
  verifier: `0x${string}`,
  ageDays: number,
  counterparty: `0x${string}` = ZERO,
): ScoringInput {
  return { outcome, verifier, counterparty, performedAt: daysAgo(ageDays) };
}

export const fixtures: ScoringFixture[] = [
  {
    name: "no evidence",
    now: NOW,
    evidence: [],
    expect: { scoreMin: 0, scoreMax: 0, confidence: "none" },
  },

  {
    name: "strong auditor — 4x success, 3 verifiers, recent (seed: agent 42 / Solidity Audit)",
    now: NOW,
    evidence: [ev("Success", A, 70), ev("Success", B, 58), ev("Success", C, 33), ev("Success", A, 9)],
    erc8004Signal: { repMean01: 0.7, validationPassRate: 0.8 },
    expect: { scoreMin: 60, scoreMax: 74, confidence: "medium" },
  },

  {
    name: "solid researcher — 3x success, 3 verifiers (seed: agent 2 / Research)",
    now: NOW,
    evidence: [ev("Success", A, 72), ev("Success", B, 51), ev("Success", C, 20)],
    erc8004Signal: { repMean01: 0.7, validationPassRate: 0.75 },
    expect: { scoreMin: 56, scoreMax: 70, confidence: "medium" },
  },

  {
    name: "weak auditor — 1 failure + 1 disputed, 2 verifiers (seed: agent 2 / Solidity Audit)",
    now: NOW,
    evidence: [ev("Failure", B, 63), ev("Disputed", C, 30)],
    erc8004Signal: { repMean01: 0.7, validationPassRate: 0.75 },
    expect: { scoreMin: 28, scoreMax: 44, confidence: "low" },
  },

  {
    name: "thin history — single success, 1 verifier (seed: agent 7 / Research)",
    now: NOW,
    evidence: [ev("Success", C, 15)],
    expect: { scoreMin: 36, scoreMax: 54, confidence: "low" },
  },

  {
    name: "one failure, 1 verifier (seed: agent 6 / Research)",
    now: NOW,
    evidence: [ev("Failure", B, 48)],
    expect: { scoreMin: 24, scoreMax: 42, confidence: "low" },
  },

  {
    name: "high confidence — 8x success, 4 verifiers, all recent",
    now: NOW,
    evidence: [
      ev("Success", A, 5),
      ev("Success", B, 8),
      ev("Success", C, 12),
      ev("Success", "0xDddDDDdDdddddDdDdddDDDDdDdddDDDdDDddddDD0", 15),
      ev("Success", A, 20),
      ev("Success", B, 25),
      ev("Success", C, 30),
      ev("Success", A, 40),
    ],
    erc8004Signal: { repMean01: 0.85, validationPassRate: 0.9 },
    expect: { scoreMin: 82, scoreMax: 96, confidence: "high" },
  },

  {
    name: "all disputed — rate falls back to neutral prior, dispute penalty applies",
    now: NOW,
    evidence: [ev("Disputed", A, 10), ev("Disputed", B, 20), ev("Disputed", C, 30)],
    expect: { scoreMin: 30, scoreMax: 46, confidence: "medium" },
  },

  {
    name: "counterparty diversity rewarded — 3x success, 3 distinct counterparties",
    now: NOW,
    evidence: [
      ev("Success", A, 10, "0x1111111111111111111111111111111111111111"),
      ev("Success", B, 20, "0x2222222222222222222222222222222222222222"),
      ev("Success", C, 30, "0x3333333333333333333333333333333333333333"),
    ],
    expect: { scoreMin: 58, scoreMax: 74, confidence: "medium" },
  },

  {
    name: "stale success — same as thin history but 200 days old, recency drags it down",
    now: NOW,
    evidence: [ev("Success", A, 200), ev("Success", B, 220), ev("Success", C, 240)],
    expect: { scoreMin: 44, scoreMax: 60, confidence: "medium" },
  },
];

/**
 * Ordering invariants the engine must preserve (fixture index pairs: higher, lower).
 */
export const ordering: Array<[number, number, string]> = [
  [1, 3, "strong auditor > weak auditor"],
  [2, 3, "solid researcher > weak auditor"],
  [1, 4, "strong auditor > thin single-success"],
  [6, 1, "8x/4-verifier high-confidence > 4x/3-verifier medium"],
  [4, 5, "single success >= single failure"],
  [8, 9, "recent 3x success (w/ counterparties) > stale 3x success"],
];
