# ProofGraph V2 — Specification

_Status: SKELETON (Sprint 0 / Day 1). Sections marked TODO are frozen on the day noted._

ProofGraph V2 produces a **task-aware reputation score** for an AI agent, derived from
**verifiable evidence**, and exposes it as a **machine-readable API** and as an
**ERC-8004 Validation** response.

---

## 1. Concepts

- **Agent** — identified by ERC-8004 `agentId` (uint256, `IdentityRegistry` tokenId). Secondary key: owner address.
- **Capability** — one of a fixed closed set: `Research`, `Coding`, `Solidity Audit`, `Data Analysis`.
- **Evidence** — a single verifiable record about one agent performing one task in one capability.
- **Score** — 0–100, per `(agent, capability)`, deterministic, explained by `reasons[]`.
- **Confidence** — `none | low | medium | high`, a function of evidence volume and verifier diversity.

---

## 2. Evidence model  — FROZEN (Day 2–4)

On-chain (`EvidenceRegistryV2` at `0x99848Ff9527C38c371D5c892a00677b90387aF4a`): compact, hash-committed.

| Field | Type | Notes |
|---|---|---|
| `id` | uint256 | auto-increment |
| `agentId` | uint256 | ERC-8004 identity |
| `capability` | string | must be in the closed set |
| `outcome` | uint8 enum | `Success` / `Failure` / `Disputed` |
| `counterparty` | address | who the work was for (0 = undisclosed) |
| `evidenceHash` | bytes32 | `keccak256(canonical off-chain JSON)` |
| `uri` | string | where the off-chain JSON lives |
| `verifier` | address | `msg.sender` (MVP) |
| `timestamp` | uint256 | `block.timestamp` |

Off-chain JSON (`public/evidence/<id>.json` for MVP): `{ taskDescription, artifacts[], verifierNote, sourceRef, ... }`.
On read, recompute `keccak256` and set `verified: true|false`.

External evidence adapters (read-only): `ReputationRegistry` feedback, `ValidationRegistry` responses → normalised into the same internal `Evidence` shape with `source: "erc8004-reputation" | "erc8004-validation"`.

---

## 3. Scoring formula  — FROZEN (Day 5), `formulaVersion = "v2.0"`

Pure function `score(evidence[], { now, erc8004Signal? }) -> { score, confidence, terms[], reasons[], penalty }`.
No network, no `Date.now()` inside — the caller passes `now` and (optionally) a pre-fetched
`erc8004Signal`. Evidence is already filtered to one `(agentId, capability)`.

### Counts

```
successes  = count(outcome == "Success")
failures   = count(outcome == "Failure")
disputed   = count(outcome == "Disputed")
total      = evidence.length
completed  = successes + failures               // disputed excluded from the rate
distinctVerifiers      = unique(verifier)
distinctCounterparties = unique(counterparty where counterparty != 0x0)
ageDays_i  = max(0, (now - (doc.performedAt ?? onchain.timestamp)) / 86400)
```

### Terms   `{ value ∈ [0,1], weight, applicable }`

| term | value | weight | applicable when |
|---|---|---|---|
| `success` | `(successes + 2) / (completed + 4)` — Beta(2,2) shrinkage | **0.45** | always |
| `verifier` | `min(distinctVerifiers, 4) / 4` | **0.20** | always |
| `volume` | `min(total, 8) / 8` | **0.13** | always |
| `recency` | `mean( exp(-ageDays_i / 45) )` | **0.12** | `total > 0` |
| `counterparty` | `min(distinctCounterparties, 3) / 3` | **0.05** | `distinctCounterparties > 0` |
| `erc8004` | `0.6 * repMean01 + 0.4 * validationPassRate` (from caller) | **0.05** | signal provided |

`repMean01` = mean ERC-8004 `NewFeedback.value` (normalised by its `valueDecimals` to a
0–1 range, clamped); `validationPassRate` = passed / total `ValidationResponse` for the agent.

### Aggregate

```
base    = Σ(value_i * weight_i  for applicable i) / Σ(weight_i  for applicable i)
penalty = (disputed / total) * 0.20                       // 0 if total == 0
score   = round( 100 * base * (1 - penalty) )             // 0 if total == 0
```

Weight of a non-applicable term is dropped from both sums (not counted as 0) — e.g. an
agent with no disclosed counterparties is *not assessed* on that axis rather than punished.

### Confidence

```
none    total == 0
low     total < 3  OR distinctVerifiers < 2
medium  total < 6  OR distinctVerifiers < 3
high    total >= 6 AND distinctVerifiers >= 3
```

### reasons[]  (one line per applicable term, plus penalty + confidence)

```
"Smoothed success rate 0.71 — 3 successes / 0 failures (Beta(2,2) prior)"
"3 independent verifiers (0.75 of cap 4)"
"Evidence volume 3 / 8"
"Average freshness 0.39 (45-day half-life)"
"Counterparty diversity not assessed — no counterparties disclosed"
"No ERC-8004 reputation signal for this agent"
"1 of 2 outcomes disputed → score x0.90"
"Confidence: medium (4 records, 3 verifiers)"
```

### Reference values on the seed dataset (sanity anchors for tests)

| agent | capability | ~score | confidence |
|---|---|---|---|
| 42 | Solidity Audit | 63–72 | medium |
| 2 | Research | 58–68 | medium |
| 6 | Coding | 58–68 | medium |
| 7 | Research | 40–52 | low |
| 2 | Solidity Audit | 32–44 | low |
| 6 | Research | 30–42 | low |

(Exact numbers depend on `now` and the live ERC-8004 signal; tests assert bands + ordering.)

---

## 4. API  — TODO (freeze Day 8)

Base: `/v2/api` (Next route handlers). CORS `*`. JSON only. Recompute per request (fine at this scale).

### `GET /v2/api/score?agent=<agentId|address>&capability=<slug>`

```jsonc
{
  "agent":   { "agentId": "42", "address": "0x…", "cardUri": "https://…" },
  "capability": "Solidity Audit",
  "score": 52,
  "confidence": "medium",
  "counts": { "evidence": 9, "verifiers": 3, "counterparties": 2, "successes": 7, "failures": 2 },
  "successRate": 0.71,
  "lastEvidenceAt": "2026-08-30T12:00:00Z",
  "reasons": [ "…", "…" ],
  "evidence": [
    { "id": "7", "source": "EvidenceRegistryV2", "capability": "Solidity Audit",
      "outcome": "Success", "verifier": "0x…", "counterparty": "0x…",
      "timestamp": "2026-08-30T12:00:00Z", "uri": "https://…", "verified": true }
  ],
  "formulaVersion": "v2.0",
  "computedAt": "2026-09-10T09:00:00Z"
}
```

### `GET /v2/api/agents/:id`

All capability scores for one agent + identity block.

### (Target) `POST` — publish score as `validationResponse` on `ValidationRegistry`

Server-side signer (ProofGraph validator key). Guarded, not exposed publicly.

---

## 5. ERC-8004 integration  — FROZEN (Day 9)

Implemented in `src/lib/erc8004.ts` + `src/lib/agentCard.ts`, assembled by
`getErc8004Profile(agentId)` → `{ signal, reputation, validations }`.

- **Identity**: `resolveAgent(agentId)` → `ownerOf`, `tokenURI`. `resolveAgentId(str)`
  accepts a numeric id or a `0x` address (address → agentId via explorer mint logs;
  errors when a wallet owns several agents).
- **Agent Card**: `fetchAgentCard(tokenURI)` — best-effort, tries 3 IPFS gateways with a
  4 s timeout each, parses `{ name, description, url, skills[], endpoints{} }` loosely.
  A fetch failure is surfaced as `{ ok: false, reason }` and never breaks a score.
  _Known limitation: public IPFS gateways are unreliable; the seed agents' shared test
  CID is not pinned, so cards resolve as `ok:false` on testnet. Production would use a
  dedicated gateway / pinning service._
- **Reputation**: `readReputationSummary` → `{ total, revoked, active, meanValue01, tags{} }`.
  `meanValue01` (heuristic 0–1 normalisation of `NewFeedback.value`) feeds the scoring
  `erc8004` term. The client-defined feedback scale means this is deliberately fuzzy.
- **Validation**: `readValidationHistory` → per-request `{ validator, response, tag,
  responseHash, lastUpdate }`. Pass rate (`response >= 50`) feeds the `erc8004` term.
- **Write Validation (Target, Day 12)**: ProofGraph registers its own `agentId`, then
  answers `validationRequest` targeting its validator address with
  `validationResponse(requestHash, response, responseURI, responseHash, tag)` where
  `response` = the task-aware score and `responseHash` commits to the evidence set.

Contract addresses: see `DECISIONS.md` §1–2. ABIs: `src/lib/abis/` (verified impls, Day 2).

---

## 6. Threat model  — TODO (write Day 13)

Placeholder. Must state at minimum:
- honest-majority verifier assumption for V2;
- sybil / collusion resistance is **out of scope** for V2 (V3);
- evidence availability: on-chain hash commits, off-chain blob may disappear → `verified:false` shown;
- ProofGraph score is advisory, not a guarantee.

---

## 7. Versioning

- V1 (`/`, `EvidenceRegistry` at `0x865BF223…` / `0x08bAa6fE…`) is frozen and stays live.
- V2 is additive: new contract, new routes under `/v2`, new libs. No V1 file is modified.
- `formulaVersion` string is bumped on any scoring change.
