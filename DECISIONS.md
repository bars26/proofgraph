# ProofGraph V2 — Decisions & Day 1 Verification

_Last updated: 2026-09-02 (Sprint 0 / Day 1)_

This file is the single source of truth for scope and architecture decisions.
V1 stays frozen; V2 is built alongside it.

---

## 1. Day 1 verification (done, on-chain checked)

Network: **Arc Testnet**, chainId `5042002` (`0x4cef52`).

| RPC endpoint | Status |
|---|---|
| `https://rpc.testnet.arc.network` | ✅ works — **canonical for V2** |
| `https://rpc.testnet.arc.io` | ✅ works (alias) |

> Note: `hardhat.config.ts` currently points `arcTestnet` at `rpc.testnet.arc.io`;
> `src/lib/proofgraph.ts` uses `rpc.testnet.arc.network`. Both resolve. V2 standardises on `.network`.

### ERC-8004 registries — ALL LIVE on Arc Testnet

Verified via `eth_getCode` (has bytecode) and `eth_call`:

| Registry | Address | Evidence |
|---|---|---|
| **IdentityRegistry** | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `name()` → `"AgentIdentity"`, `symbol()` → `"AGENT"` (ERC-721; not Enumerable) |
| **ReputationRegistry** | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | has bytecode; custom feedback interface (not ERC-721) |
| **ValidationRegistry** | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` | has bytecode; request/response interface |

Implication: **no reference registries to deploy.** The Day 1 "deploy our own 8004" risk is removed.

Function shapes (from Arc docs — must be re-confirmed against verified ABIs on arcscan in Day 2):

- Identity: `register(string metadataURI)` → mints ERC-721, returns `agentId` (tokenId). `ownerOf`, `tokenURI` standard.
- Reputation: `giveFeedback(uint256 agentId, int128 score, uint8, string, string, string, string, bytes32)` + a `NewFeedback`-style event.
- Validation: `validationRequest(address validator, uint256 agentId, string uri, bytes32 hash)` → `validationResponse(bytes32 requestHash, uint8 status, string, bytes32, string)`.

### ProofGraph V2 — deployed Day 3

| Contract | Address (Arc Testnet) | Deployment |
|---|---|---|
| **EvidenceRegistryV2** | `0x99848Ff9527C38c371D5c892a00677b90387aF4a` | `ignition/deployments/evidence-registry-v2/` |

Deployer: `0x4f80b5c475fced34fc9a07ffccf39e1adc1406bf`. Bytecode 4175 B. `evidenceCount` starts at 0.
Wired into `.env.local` as `NEXT_PUBLIC_EVIDENCE_REGISTRY_V2` (gitignored).
Explorer: https://testnet.arcscan.app/address/0x99848Ff9527C38c371D5c892a00677b90387aF4a

### ProofGraph V1 — both deployments live, DO NOT TOUCH

| Label | Address | Bytecode | Used by |
|---|---|---|---|
| V1 (README / first deploy) | `0x08bAa6fE21c76aF38a574c891394d5b43258EdcE` | 2104 B | README, `ignition/deployments/chain-5042002` |
| V1 (frontend) | `0x865BF22320f07Bf23Dc384e314d29fad8A92B939` | 2610 B | `src/lib/proofgraph.ts`, live Vercel app, `ignition/deployments/proofgraph-v2` dir |

Same contract source, two deploys. The `ignition/deployments/proofgraph-v2` folder name is misleading — it is **not** a real V2, just a redeploy of the V1 `EvidenceRegistry`.

### Wallet

Deployer / V1 "ResearchAgent #11" address: `0x4f80b5c475fced34fc9a07ffccf39e1adc1406bf`
Balance on Arc Testnet: ~480 native units (USDC-gas). **Funded — no faucet trip needed for now.**
Private key lives only in the user's local `.env` as `ARC_PRIVATE_KEY` (never committed, never shown to the assistant).

### Toolchain

- Node `v24.15.0`, npm `11.12.1`
- Next `16.3.2` (experimental line — see `AGENTS.md`; check `node_modules/next/dist/docs/` before app-router changes)
- React `19.2.8`, viem `2.55.19`, Hardhat `3.14`, hardhat-toolbox-viem, forge-std
- `npm install` OK (514 pkgs). V1 test baseline: **13 passing** (`npx hardhat test`).

---

## 2. Architecture decision

**ProofGraph V2 = ERC-8004 ValidationRegistry validator + own `EvidenceRegistryV2`.**

- ProofGraph registers its own **validator agent identity** in `IdentityRegistry` (Day 2).
- ProofGraph reads `IdentityRegistry` to resolve `agentId → owner + Agent Card (tokenURI)`.
- ProofGraph reads `ReputationRegistry` feedback + `ValidationRegistry` responses as **evidence inputs**.
- ProofGraph's own `EvidenceRegistryV2` stores the **richer** evidence 8004 does not model
  (source, counterparty, outcome, provenance, capability tag, off-chain URI + hash).
- ProofGraph publishes its computed task-aware score back via `validationResponse`
  (Target scope, not stretch — see sprint plan).

V1 contracts and `/` route are untouched. V2 lives under `/v2` and new `src/lib/*`.

---

## 3. Evidence sources (V2 MVP), priority order

1. **`EvidenceRegistryV2`** (our contract) — primary, richest fields.
2. **`ReputationRegistry.giveFeedback`** events on Arc Testnet — real external signal.
3. **`ValidationRegistry`** responses — real external signal.

### Day 1 block D — real ERC-8004 activity on Arc Testnet (measured via arcscan API)

There **is** substantial real activity — evidence ingestion has real data to work with.
(arcscan API caps responses at 1000 rows; true counts are higher. Public RPC prunes history,
so indexing will use the arcscan Etherscan-compatible API: `https://testnet.arcscan.app/api`.)

| Registry | Observed events (sample of 1000) | Likely meaning (decode in Day 2) |
|---|---|---|
| Identity | `0xddf252ad…` ×251 (ERC-721 `Transfer` — mints), plus `0xca52e62c…` ×251, `0x2c149ed5…` ×250, `0xf8e1a15a…` ×243 | agent registrations + metadata/registration events |
| Reputation | `0x6a4a6174…` ×994 | feedback-given event (the main signal) |
| Validation | `0x530436c3…` ×504, `0xafddf629…` ×491 | validation request / validation response |

Conclusion: our own seed is still useful for a controlled demo, but we can also index
**real** feedback + validation signals. EIP-712 attestation script stays a stretch, not a necessity.

### Day 2 — verified ABIs pulled, live behaviour confirmed

All 3 registries are **ERC1967 proxies**. Implementation contracts (ABIs saved to `src/lib/abis/`):

| Proxy | Implementation | Impl name |
|---|---|---|
| `0x8004A818…` | `0x7274e874ca62410a93bd8bf61c69d8045e399c02` | `IdentityRegistryUpgradeable` |
| `0x8004B663…` | `0x16e0fa7f7c56b9a767e34b192b51f921be31da34` | `ReputationRegistryUpgradeable` |
| `0x8004Cb1B…` | `0xdb31f5d9167f8ebc8b30fbbf814c4d297c2d7f99` | `ValidationRegistryUpgradeable` |

Verified signatures now in use (`src/lib/erc8004.ts`):
- Identity: `register(string agentURI) -> uint256`, `ownerOf`, `tokenURI`, event `Registered(agentId, agentURI, owner)`
- Reputation: `giveFeedback(agentId, int128 value, uint8 decimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)`, `readAllFeedback(...)`, event `NewFeedback(...)`
- Validation: `validationRequest(validator, agentId, uri, hash)` → `validationResponse(requestHash, uint8 response, uri, hash, string tag)`, events `ValidationRequest` / `ValidationResponse`

Smoke test vs live registries (agents 2, 6, 42): `resolveAgent` + `readAllFeedback` work.
Agent 2 = 47 feedback rows, agent 6 = 46, agent 42 = 30. Agent Cards are `ipfs://…`.

**Key finding — real Reputation tags are freeform sentiment, not capability-structured:**
observed `tag1` values are `"good_service"`, `"fast_execution"`, `"successful_trade"`, …
→ the standard's on-chain data is generic praise, not task/capability-typed.
→ **confirms Path B**: ProofGraph's own `EvidenceRegistryV2` with explicit
`capability` + `outcome` + `counterparty` is the structured layer 8004 lacks.
8004 Reputation is consumed as a *supplementary* aggregate signal only; ProofGraph also acts
as a Validation validator. (No A/B decision needed from the user — the on-chain data settled it.)

---

## 4. Fixed choices

| Thing | Decision |
|---|---|
| Capability list (closed) | `Research`, `Coding`, `Solidity Audit`, `Data Analysis` (same as V1) |
| Off-chain evidence storage | plain HTTPS JSON (hosting/`public/`), on-chain stores `keccak256(json)` + `uri`. IPFS later. |
| Evidence identity key | ERC-8004 `agentId` (uint256) is canonical; keep `agent` address as secondary index |
| Contract deploy tool | Hardhat Ignition (same as V1), new module `EvidenceRegistryV2.ts`, new deployment dir |
| Verifier auth (MVP) | `msg.sender` = verifier. EIP-712 signed attestations = stretch. |
| Network | Arc Testnet only. **No mainnet deploy in this sprint.** |
| Scoring | deterministic, published weighted formula (see `SPEC.md`). No ML. |

---

## 5. Scoring weights — DRAFT (freeze in Day 5, spec in `SPEC.md`)

```
score(agent, capability) = 100 * (
    w_success   * successRate        // Wilson lower bound
  + w_verifier  * verifierDiversity  // min(distinctVerifiers, CAP_V)/CAP_V
  + w_cparty    * counterpartyDiversity
  + w_recency   * recencyWeight      // Σ exp(-Δt / HALF_LIFE), normalised
  + w_volume    * volumeWeight       // min(total, CAP_N)/CAP_N
  + w_erc8004   * erc8004Signal      // normalised external reputation/validation
)

draft weights:  w_success .40  w_verifier .20  w_cparty .10  w_recency .10  w_volume .10  w_erc8004 .10
draft caps:     CAP_V 5   CAP_C 5   CAP_N 20   HALF_LIFE 60 days
confidence:     f(total, distinctVerifiers) -> none | low | medium | high
reasons[]:      one human-readable string per contributing term
```

(V1 for reference used `0.7 capability + 0.2 evidence + 0.1 independence` on demo data.)

---

## 6. Explicitly OUT of this sprint

Mainnet deploy · ERC-8183 jobs · payment/settlement history · sybil/collusion/permission system ·
trust-based payment limits · execution scope · marketplace integrations · ML scoring ·
multi-verifier attestation UI.

## 7. Risk register

| Risk | Mitigation |
|---|---|
| ~~ERC-8004 not on Arc testnet~~ | **Resolved** — all 3 registries live |
| Not enough real 8004 data on testnet | own seed + (stretch) EIP-712 attestation script |
| ERC-8004 ABIs differ from docs summary | pull verified ABIs from arcscan / `erc-8004/erc-8004-contracts` in Day 2 |
| Off-chain storage flaky | start with static JSON in `public/`, IPFS later |
| Next 16 experimental breakage | read `node_modules/next/dist/docs/` before app-router work |
| Time | Day 8 read-only API = MVP floor; UI + validation-write are Target/Stretch |
