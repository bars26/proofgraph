# ProofGraph V2: task-aware agent trust, backed by evidence and ERC-8004, on Arc

_Draft for the Arc House forum (Agentic Economy) / Guest Post pitch. Adapt tone as needed._

---

## The question

An agent economy needs an answer to: **which agent can I trust for _this_ task?**
An agent can be excellent at research and mediocre at Solidity auditing. A single global
reputation number hides that.

ERC-8004 gives agents an on-chain identity, a reputation registry, and a validation
registry — and all three are already live on Arc Testnet. But looking at the real
`ReputationRegistry` data on Arc today, the feedback tags are freeform sentiment:
`good_service`, `fast_execution`, `successful_trade`. Useful, but not task-structured,
and nothing aggregates it into a per-capability, evidence-backed signal.

That gap is what **ProofGraph V2** fills.

## What it does

Given an `(agentId, capability)`, ProofGraph:

1. reads **structured evidence** from its own `EvidenceRegistryV2` — each record is
   `{ agentId, capability, outcome (Success/Failure/Disputed), counterparty,
   keccak256(off-chain doc), uri, verifier, timestamp }`;
2. re-fetches each off-chain doc and **verifies the hash** against the on-chain commitment;
3. reads the agent's **ERC-8004** reputation mean and validation pass-rate as a
   supplementary signal;
4. runs a **frozen, public, deterministic formula** (`formulaVersion v2.0`, `SPEC.md` §3):
   a Beta(2,2)-smoothed success rate, verifier diversity, counterparty diversity,
   45-day recency decay, evidence volume, and the ERC-8004 term — with
   applicability-aware weight renormalisation and a dispute penalty;
5. returns a **0–100 score, a confidence tier, and a `reasons[]` array** explaining
   every term's contribution;
6. can **publish that score back to the ERC-8004 Validation Registry** via
   `validationResponse` — ProofGraph is a registered validator (`agentId 889819`), and
   its own responses then feed back into step 3.

So it's not a system beside the standard — it's an ERC-8004 Validation Registry
participant that turns raw signals into task-aware trust.

## It's real and on-chain

- **Real:** the ERC-8004 registries and the reputation data they hold; the
  `EvidenceRegistryV2` contract and every record in it; the hash verification; the
  scoring; the `validationResponse` write-back; the identity registration.
- **Seeded:** the *contents* of the evidence dataset (19 labelled demo records across
  4 seed agents). It's a demo layer, clearly marked as such — the point of V2 was to
  prove the end-to-end path from verifiable evidence to a task-specific, explainable,
  machine-readable score, and back onto ERC-8004.

## Try it

- UI: <https://proofgraph-gamma.vercel.app/v2> — pick seed agent `2`, `6`, `42`, or `7`
- `GET /v2/api/score?agent=42&capability=Solidity%20Audit`
- `GET /v2/api/agents/42` — full scorecard
- `EvidenceRegistryV2`: `0x99848Ff9527C38c371D5c892a00677b90387aF4a` (Arc Testnet)
- Code / spec / threat model / roadmap: <https://github.com/bars26/proofgraph/tree/v2>
- `npx hardhat run scripts/selftest-v2.ts --network arcTestnet` → asserts the whole
  pipeline against live testnet

Example of the task-aware split (live numbers):

| agent | Research | Coding | Solidity Audit | Data Analysis |
|---|---|---|---|---|
| 42 | — | 46 | **68** | 32 |
| 2 | **63** | — | 37 | 44 |

Same formula, same registry — different scores per capability, each with a `reasons[]`
you can inspect.

## What I want feedback on

1. **The formula.** Weights and confidence tiers are frozen and public. Would you route
   a real task on a `medium`-confidence score? What would raise your trust?
2. **The evidence model.** Is `{ outcome, counterparty, verifier, hash+uri }` the right
   minimal shape, or is something missing for it to be useful as an ERC-8004 Validation
   input?
3. **The API.** Is the response enough for a marketplace / router to consume directly?

## What's next

ERC-8183 jobs as automatic evidence, payment-history signals, reputation-over-time, and
— gating any mainnet move — sybil / collusion resistance. Full list in `ROADMAP.md`.

**The score is advisory, not a guarantee.** Threat model and assumptions:
`THREAT-MODEL.md`.
