#!/usr/bin/env node
/**
 * ProofGraph MCP server.
 *
 * Exposes ProofGraph's task-aware agent trust scores as MCP tools so any MCP client
 * (Claude Desktop, an agent runtime, …) can ask "can I trust agent X for Solidity
 * auditing?" and get an explained 0–100 score read live from Arc Testnet.
 *
 * Read-only. No payment (that is the x402 HTTP path). Wraps src/lib/proofgraphV2.
 *
 * Run:  npx -y tsx packages/proofgraph-mcp/src/index.ts       (stdio)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { resolveAgentId } from "../../../src/lib/erc8004.ts";
import {
  CAPABILITIES,
  isCapability,
  scoreCapabilityApi,
  agentScorecardApi,
} from "../../../src/lib/proofgraphV2.ts";

const CAP_LIST = CAPABILITIES.join(", ");

const server = new McpServer({
  name: "proofgraph",
  version: "2.5.0",
});

function text(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}
function err(message: string, hint?: string) {
  return { isError: true, content: [{ type: "text" as const, text: hint ? `${message}\n${hint}` : message }] };
}

async function toAgentId(input: string): Promise<bigint | { error: string }> {
  try {
    return await resolveAgentId(input.trim());
  } catch (e) {
    return { error: (e as Error).message };
  }
}

server.registerTool(
  "get_agent_score",
  {
    title: "Get a task-aware trust score",
    description:
      `Score how much an AI agent can be trusted for one capability, from verifiable ` +
      `on-chain evidence + ERC-8004 signals on Arc Testnet. Returns a 0–100 score, a ` +
      `confidence tier (none/low/medium/high) and a reasons[] breakdown. ` +
      `capability must be one of: ${CAP_LIST}.`,
    inputSchema: {
      agent: z.string().describe("ERC-8004 agentId (numeric) or a 0x wallet address"),
      capability: z.string().describe(`one of: ${CAP_LIST}`),
    },
  },
  async ({ agent, capability }) => {
    if (!isCapability(capability)) return err(`unknown capability "${capability}"`, `one of: ${CAP_LIST}`);
    const id = await toAgentId(agent);
    if (typeof id !== "bigint") return err(`could not resolve agent "${agent}"`, id.error);
    try {
      const r = await scoreCapabilityApi(id, capability, new Date().toISOString());
      return text({
        agent: r.agent,
        capability: r.capability,
        score: r.score,
        confidence: r.confidence,
        successRate: r.successRate,
        counts: r.counts,
        reasons: r.reasons,
        lastEvidenceAt: r.lastEvidenceAt,
        erc8004: r.erc8004.signal,
        formulaVersion: r.formulaVersion,
        note: "advisory, not a guarantee",
      });
    } catch (e) {
      return err("scoring failed", (e as Error).message);
    }
  },
);

server.registerTool(
  "get_agent_scorecard",
  {
    title: "Get all capability scores for an agent",
    description:
      "Full ProofGraph scorecard for one agent: a score + confidence + reasons for each " +
      `of the ${CAPABILITIES.length} capabilities (${CAP_LIST}), plus the agent's ERC-8004 ` +
      "identity, reputation summary and validation history.",
    inputSchema: {
      agent: z.string().describe("ERC-8004 agentId (numeric) or a 0x wallet address"),
    },
  },
  async ({ agent }) => {
    const id = await toAgentId(agent);
    if (typeof id !== "bigint") return err(`could not resolve agent "${agent}"`, id.error);
    try {
      const r = await agentScorecardApi(id, new Date().toISOString());
      return text({
        agent: r.agent,
        erc8004: {
          signal: r.erc8004.signal,
          reputation: r.erc8004.reputation,
          validations: r.erc8004.validations.length,
        },
        capabilities: r.capabilities.map((c) => ({
          capability: c.capability,
          score: c.score,
          confidence: c.confidence,
          counts: c.counts,
          reasons: c.reasons,
        })),
        formulaVersion: r.formulaVersion,
        computedAt: r.computedAt,
      });
    } catch (e) {
      return err("scoring failed", (e as Error).message);
    }
  },
);

server.registerTool(
  "resolve_agent",
  {
    title: "Resolve an address or id to an ERC-8004 agentId",
    description:
      "Given a numeric agentId or a 0x wallet address, return the canonical ERC-8004 " +
      "agentId plus the owner address and Agent Card URI. Errors if a wallet owns several agents.",
    inputSchema: {
      address_or_id: z.string().describe("numeric agentId or a 0x address"),
    },
  },
  async ({ address_or_id }) => {
    const id = await toAgentId(address_or_id);
    if (typeof id !== "bigint") return err(`could not resolve "${address_or_id}"`, id.error);
    try {
      const { resolveAgent } = await import("../../../src/lib/erc8004.ts");
      const a = await resolveAgent(id);
      return text({ agentId: a.agentId.toString(), owner: a.owner, cardUri: a.cardUri });
    } catch (e) {
      return err("resolve failed", (e as Error).message);
    }
  },
);

server.registerTool(
  "list_capabilities",
  {
    title: "List the capabilities ProofGraph scores",
    description: "The fixed set of task capabilities ProofGraph produces scores for.",
    inputSchema: {},
  },
  async () => text({ capabilities: CAPABILITIES, formulaVersion: "v2.0" }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("proofgraph-mcp: ready on stdio");
