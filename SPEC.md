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

## 2. Evidence model  — TODO (freeze Day 2)

On-chain (`EvidenceRegistryV2`): compact, hash-committed.

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

## 3. Scoring formula  — TODO (freeze Day 5)

Draft (see `DECISIONS.md` §5):

```
filter evidence to the requested capability
successRate          = WilsonLowerBound(successes, total, z=1.96)
verifierDiversity     = min(distinctVerifiers, CAP_V) / CAP_V
counterpartyDiversity = min(distinctCounterparties, CAP_C) / CAP_C
recencyWeight         = normalise( Σ exp(-Δdays / HALF_LIFE) )
volumeWeight          = min(total, CAP_N) / CAP_N
erc8004Signal         = normalise(external reputation + validation pass rate)

score = 100 * ( 0.40·successRate + 0.20·verifierDiversity + 0.10·counterpartyDiversity
              + 0.10·recencyWeight + 0.10·volumeWeight + 0.10·erc8004Signal )

CAP_V=5  CAP_C=5  CAP_N=20  HALF_LIFE=60d

confidence:
  none    total == 0
  low     total < 3  OR distinctVerifiers < 2
  medium  total < 8  OR distinctVerifiers < 3
  high    otherwise

reasons[]: one string per non-zero term, e.g.
  "90% success rate (Wilson) over 12 evidence items"
  "3 independent verifiers (diversity 0.60)"
  "only 1 counterparty — low independence"
  "most evidence within the last 60 days"
  "ERC-8004 reputation signal: +4 net feedback"
```

Determinism: pure function, no network, no clock read inside the formula (caller passes `now`).

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

## 5. ERC-8004 integration  — TODO (freeze Day 9)

- **Read Identity**: `agentId → ownerOf(agentId)`, `tokenURI(agentId)` → Agent Card (skills, endpoints).
- **Read Reputation**: index feedback events → `erc8004Signal` input.
- **Read Validation**: index request/response → `erc8004Signal` input + show in evidence list.
- **Write Validation (Target)**: ProofGraph registers its own `agentId`, then answers
  `validationRequest` targeting its validator address with `validationResponse(requestHash, status, …)`
  where `status`/payload encode the task-aware score + `evidenceHashRoot`.

Contract addresses: see `DECISIONS.md` §1. ABIs: `src/lib/abis/` (pulled from arcscan, Day 2).

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
