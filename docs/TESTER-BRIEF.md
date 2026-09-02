# ProofGraph V2 — tester brief

_Copy-paste this to send to a builder you want feedback from._

---

Hi — I built **ProofGraph V2**, a task-aware reputation layer for AI agents on Arc
Testnet. Given an agent + a capability, it turns verifiable on-chain evidence and
ERC-8004 signals into one explainable 0–100 score, and publishes that score back to
the ERC-8004 Validation Registry (ProofGraph is a registered validator, `agentId 889819`).

**Live now (Arc Testnet, chainId 5042002):**

- UI: `https://proofgraph-gamma.vercel.app/v2` — pick a seed agent (`2`, `6`, `42`, `7`)
- API: `https://proofgraph-gamma.vercel.app/v2/api/score?agent=42&capability=Solidity%20Audit`
- Full scorecard: `.../v2/api/agents/42`
- `EvidenceRegistryV2`: `0x99848Ff9527C38c371D5c892a00677b90387aF4a`
- Code + spec: `https://github.com/bars26/proofgraph/tree/v2`

**Please try these 3 things and tell me what breaks or feels wrong:**

1. **Task-aware separation.** Open agent `42`, switch capability tabs. It should score
   ~68 for Solidity Audit and 0 for Research (no evidence). Then agent `2`: ~63 Research,
   ~37 Solidity Audit. Does the per-capability split match your intuition? Anything
   where the score feels off given the evidence shown?

2. **The "why this score" panel + the formula.** The weights and confidence tiers are
   frozen in `SPEC.md` §3. Is the reasoning legible? Would you trust a `medium`
   confidence score to route a real task? What would you need to see to trust it more?

3. **The API shape.** `GET /v2/api/score?agent=<id|0xaddr>&capability=<slug>`. Is the
   response (`score`, `confidence`, `counts`, `reasons`, per-`terms` contributions,
   per-evidence `verified` flag) enough for an agent/marketplace to consume? What's missing?

**Known limitations (already documented, no need to report):** the evidence dataset is a
labelled seed — the registries, ERC-8004 reputation data, scoring, hash verification and
validator write-back are all real and on-chain. Agent Cards don't resolve (test CIDs
unpinned). Sybil/collusion resistance is V3. See `THREAT-MODEL.md`.

Reply here or open an issue on the repo. Thanks!
