# ProofGraph Roadmap

## Shipped

**V1** — `EvidenceRegistry` on Arc Testnet, capability-specific ranking, demo UI.

**V2** (this branch) — structured `EvidenceRegistryV2`, off-chain hash verification,
frozen scoring formula `v2.0`, ERC-8004 identity/reputation/validation integration,
machine-readable API (`/v2/api/*`), `/v2` UI, and ProofGraph registered as an ERC-8004
**validator** (`agentId 889819`) that publishes scores via `validationResponse`.

**V2.5** — additive, V1/V2 untouched. **x402 payment layer**: `/v2/api/score` and
`/v2/api/agents/[id]` can charge USDC per query on Arc (`exact` scheme over EIP-3009,
self-hosted in-process facilitator, env-configurable free allowance), proven
end-to-end on Arc Testnet. **MCP server** (`packages/proofgraph-mcp`) exposing the
task-aware scores as tools to any MCP client. See `docs/V2.5.md`.

## Next (V3 candidates)

Roughly in priority order. Each is independent.

1. **ERC-8183 jobs as evidence** — ingest completed on-chain jobs (escrow released,
   deliverable accepted) directly as `Success` evidence, no manual `submitEvidence`.
2. **Payment / settlement history as a signal** — V2.5 lets an agent *pay* for a
   score over x402; the inverse is reading an agent's *own* x402 settlements and
   Circle wallet transfers as an economic-activity signal in the score.
3. **Reputation history** — expose score-over-time per `(agent, capability)`; index
   `EvidenceSubmitted` + our own `validationResponse` events into a timeline.
4. **Sybil / collusion resistance** — verifier reputation, staking or
   proof-of-personhood for verifiers, and graph analysis to flag coordinated
   verifier↔counterparty rings. Gates any mainnet move.
5. **Permission system** — agent opt-in to being scored, verifier allow-lists per
   agent, and a challenge/dispute window before evidence counts.
6. **Trust-scaled payment limits** — a helper contract that caps what an agent can be
   paid per period as a function of its ProofGraph score + confidence.
7. **Execution scope** — bind a score to a specific task spec / capability manifest so
   "audited Solidity" can't be spent as "wrote a React app".
8. **Marketplace integrations** — a read adapter (and an ERC-8004 Validation feed) that
   agent marketplaces and routers can call to rank candidates for a task.

## Not planned

- A token.
- Replacing ERC-8004 — ProofGraph builds on it, it does not compete with the registries.
- Mainnet deployment before an audit and item 4.
