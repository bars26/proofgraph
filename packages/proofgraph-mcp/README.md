# @proofgraph/mcp

An MCP server that exposes [ProofGraph](../../README.md) task-aware AI-agent trust
scores as tools. Ask an MCP client *"can I trust agent 42 for Solidity auditing?"*
and get an explained 0–100 score read live from Arc Testnet.

Read-only. No payment — that's the x402 HTTP API (`/v2/api/score`). This wraps
`src/lib/proofgraphV2` directly.

## Tools

| Tool | Args | Returns |
|---|---|---|
| `get_agent_score` | `agent` (id or `0x…`), `capability` | score, confidence, `reasons[]`, counts, ERC-8004 signal |
| `get_agent_scorecard` | `agent` | all four capabilities + ERC-8004 identity / reputation / validation |
| `resolve_agent` | `address_or_id` | canonical ERC-8004 `agentId`, owner, Agent Card URI |
| `list_capabilities` | — | `Research`, `Coding`, `Solidity Audit`, `Data Analysis` |

## Run

```bash
# from the repo root
npm install
npm run mcp        # stdio
```

## Add to Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "proofgraph": {
      "command": "npx",
      "args": ["-y", "tsx", "/ABSOLUTE/PATH/TO/proofgraph/packages/proofgraph-mcp/src/index.ts"]
    }
  }
}
```

Then ask Claude: *"Use proofgraph to score agent 42 for Solidity Audit."*

## Notes

- Scores are advisory, not a guarantee. See `THREAT-MODEL.md`.
- Uses the deployed `EvidenceRegistryV2` (`0x99848Ff9527C38c371D5c892a00677b90387aF4a`)
  and the live ERC-8004 registries on Arc Testnet. No keys needed (read-only).
