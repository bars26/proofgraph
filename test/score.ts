import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { scoreEvidence, FORMULA_VERSION } from "../src/lib/score.ts";
import { fixtures, ordering } from "./fixtures/scoring.ts";

describe("scoreEvidence (formula " + FORMULA_VERSION + ")", () => {
  for (const fx of fixtures) {
    it(`${fx.name}`, () => {
      const r = scoreEvidence(fx.evidence, { now: fx.now, erc8004Signal: fx.erc8004Signal });
      assert.ok(
        r.score >= fx.expect.scoreMin && r.score <= fx.expect.scoreMax,
        `score ${r.score} outside [${fx.expect.scoreMin}, ${fx.expect.scoreMax}]`,
      );
      assert.equal(r.confidence, fx.expect.confidence);
      assert.equal(r.formulaVersion, FORMULA_VERSION);
      assert.ok(r.score >= 0 && r.score <= 100);
      assert.ok(r.reasons.length > 0);
    });
  }

  it("preserves ordering invariants", () => {
    const scores = fixtures.map(
      (fx) => scoreEvidence(fx.evidence, { now: fx.now, erc8004Signal: fx.erc8004Signal }).score,
    );
    for (const [hi, lo, label] of ordering) {
      assert.ok(scores[hi] >= scores[lo], `${label}: [${hi}]=${scores[hi]} < [${lo}]=${scores[lo]}`);
    }
  });

  it("is deterministic", () => {
    const fx = fixtures[1];
    const a = scoreEvidence(fx.evidence, { now: fx.now, erc8004Signal: fx.erc8004Signal });
    const b = scoreEvidence(fx.evidence, { now: fx.now, erc8004Signal: fx.erc8004Signal });
    assert.deepEqual(a, b);
  });

  it("empty evidence → score 0, confidence none", () => {
    const r = scoreEvidence([], { now: "2026-09-02T00:00:00Z" });
    assert.equal(r.score, 0);
    assert.equal(r.confidence, "none");
    assert.equal(r.terms.length, 0);
  });

  it("drops non-applicable term weight (no counterparty ⇒ counterparty term contributes 0)", () => {
    const r = scoreEvidence(fixtures[2].evidence, { now: fixtures[2].now });
    const cp = r.terms.find((t) => t.key === "counterparty")!;
    assert.equal(cp.applicable, false);
    assert.equal(cp.contribution, 0);
    const base = r.terms.reduce((a, t) => a + t.contribution, 0);
    // score is exactly round(100 * base * (1 - penalty))
    assert.equal(r.score, Math.round(100 * base * (1 - r.penalty)));
    // applicable weights renormalise to 1 (contribution = value * weight / activeWeight)
    const active = r.terms.filter((t) => t.applicable);
    const weightShare = active.reduce((a, t) => a + (t.value > 0 ? t.contribution / t.value : 0), 0);
    assert.ok(Math.abs(weightShare - 1) < 1e-9, `weight shares sum to ${weightShare}, expected 1`);
  });
});
