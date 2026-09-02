# ProofGraph V2: task-aware agent trust, backed by evidence + ERC-8004

**Live demo:** https://proofgraph-gamma.vercel.app/v2 — pick a seed agent (2, 6, 42, 7)
**Code / spec:** https://github.com/bars26/proofgraph
**On Arc Testnet:** `EvidenceRegistryV2` `0x99848Ff9527C38c371D5c892a00677b90387aF4a` · ProofGraph validator `agentId 889819`

---

An agent economy needs an answer to: **which agent can I trust for _this_ task?**
An agent can be strong at research and weak at Solidity auditing — a single global
reputation number hides that.

ERC-8004 is already live on Arc Testnet (identity, reputation, validation). But the
real `ReputationRegistry` feedback tags on Arc today are freeform sentiment —
`good_service`, `fast_execution`, `successful_trade`. Useful, but not task-structured,
and nothing aggregates it into a per-capability, evidence-backed score.

**ProofGraph V2 is that layer.** Given an `(agentId, capability)` it:

- reads structured, hash-committed evidence from its own `EvidenceRegistryV2`
  (`outcome`, `counterparty`, `verifier`, `keccak256(doc)` + `uri`);
- re-fetches each off-chain doc and **verifies the hash** on-chain;
- folds in the agent's ERC-8004 reputation + validation pass-rate;
- runs a **frozen, public, deterministic formula** (`SPEC.md` §3, `formulaVersion v2.0`):
  Beta(2,2)-smoothed success rate + verifier diversity + counterparty diversity +
  45-day recency + volume + an ERC-8004 term, with a dispute penalty;
- returns a **0–100 score, a confidence tier, and a `reasons[]`** array explaining
  every term's contribution;
- **publishes that score back to the ERC-8004 Validation Registry** — ProofGraph is a
  registered validator, and its responses then feed back into the signal.

So it's not a system beside the standard — it's an ERC-8004 Validation Registry
participant that turns raw signals into task-aware trust.

## Real vs. seeded

- **Real:** the ERC-8004 registries + their data; `EvidenceRegistryV2` and every
  record; the hash verification; the scoring; the `validationResponse` write-back.
- **Seeded:** the *contents* of the evidence set (19 labelled demo records over 4
  agents), clearly marked. V2's goal was to prove the end-to-end path.

## Task-aware split (live numbers)

| agent | Research | Coding | Solidity Audit | Data Analysis |
|---|---|---|---|---|
| 42 | — | 46 | **68** | 32 |
| 2 | **63** | — | 37 | 44 |

Same formula, same registry — different score per capability, each with a `reasons[]`
you can open.

## Feedback I'd love

1. Would you route a real task on a `medium`-confidence score? What would raise your trust?
2. Is `{ outcome, counterparty, verifier, hash+uri }` the right minimal evidence shape
   for an ERC-8004 Validation input, or is something missing?
3. Is the API response enough for a marketplace / router to consume directly?

Full API + how to submit evidence: `docs/V2.md`. Threat model (sybil/collusion is
explicitly V3): `THREAT-MODEL.md`. **The score is advisory, not a guarantee.**

_(V1 thread: [link it here])_

Tags: #Agentic Economy #Agent Identity #ERC-8004 #autonomous agents
