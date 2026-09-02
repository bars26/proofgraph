# ProofGraph V2 — Threat Model

ProofGraph V2 produces an **advisory** task-aware reputation score. It is not a
guarantee, an audit, or a slashing mechanism. This document states what V2 assumes,
what it defends against, and what it explicitly does not.

## Trust assumptions

1. **Honest-majority verifiers.** Anyone can call `submitEvidence` and becomes the
   recorded `verifier`. The scoring formula rewards *verifier diversity* and *counterparty
   diversity* precisely because a single actor can flood evidence. V2 assumes that, for
   any agent worth scoring, independent verifiers outnumber colluding ones. It does not
   enforce this.
2. **Off-chain evidence is available at score time.** The chain stores
   `keccak256(canonical doc)` + a `uri`. If the document is unreachable, that record is
   surfaced as `verified: null` and still counts toward volume/outcome — a determined
   actor could submit records whose docs never resolve.
3. **ERC-8004 signals are taken at face value.** `ReputationRegistry` feedback and
   `ValidationRegistry` responses are read as-is. Their own sybil resistance (or lack
   of it) is inherited. The `erc8004` term carries only 5% weight for this reason.
4. **The scoring formula is public and fixed** (`SPEC.md` §3, `formulaVersion`). A
   caller can compute exactly what evidence would move a score.

## What V2 does defend against

- **Hash tampering.** The off-chain doc is re-canonicalised and hashed on read; a
  mismatch is reported as `verified: false` and visible in the API and UI.
- **Single-verifier inflation.** `min(distinctVerifiers, 4) / 4` caps the benefit of
  one verifier; `confidence` drops to `low` below 2 verifiers regardless of score.
- **Small-sample over-confidence.** Success rate uses a Beta(2,2) shrinkage prior, so
  "3/3 success" scores well below 100 and `confidence` reflects sample size.
- **Stale reputation.** A 45-day half-life recency term decays old evidence.
- **Disputed work.** `Disputed` outcomes apply a multiplicative penalty (up to ×0.80).
- **Cross-capability leakage.** Evidence is bucketed per `(agentId, capability)`; a
  strong researcher gets no Solidity-audit credit.

## Explicitly out of scope for V2 (→ V3, see ROADMAP.md)

- **Sybil / collusion resistance** — staking, proof-of-personhood, verifier reputation,
  or graph analysis to detect coordinated verifier + counterparty rings.
- **Evidence-availability enforcement** — pinning proofs, DA sampling, or slashing for
  vanished docs.
- **Permissioning** — anyone can submit evidence about any agentId today; there is no
  agent opt-in, allow-listing, or challenge window.
- **Economic weight** — no bond behind a score, no trust-scaled payment limits, no
  execution-scope enforcement.
- **Formula governance** — changing weights is a code change + `formulaVersion` bump,
  not an on-chain vote.

## Deployment notes

- Contracts are unaudited. `EvidenceRegistryV2` is deliberately minimal (no upgrade
  path, no admin, no external calls) to keep the attack surface small.
- The ProofGraph validator's operating key (`ARC_PRIVATE_KEY`) can write
  `validationResponse` for any request targeting it. Compromise of that key lets an
  attacker publish arbitrary scores under ProofGraph's name — it does not affect
  `EvidenceRegistryV2` or the read pipeline.
- Testnet only. No mainnet deployment until an audit and the V3 sybil work.
