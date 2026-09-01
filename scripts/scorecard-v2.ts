/**
 * Print live V2 scorecards for the seed agents.
 *   npx hardhat run scripts/scorecard-v2.ts --network arcTestnet
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getAgentScorecard } from "../src/lib/proofgraphV2.ts";

if (!process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_V2) {
  const p = join(process.cwd(), "ignition/deployments/evidence-registry-v2/deployed_addresses.json");
  const j = JSON.parse(readFileSync(p, "utf8")) as Record<string, string>;
  const k = Object.keys(j).find((x) => x.includes("EvidenceRegistryV2"));
  if (k) process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_V2 = j[k];
}

// verify against local public/ files (seed URIs point at the prod host)
const g = globalThis as { fetch: typeof fetch };
const realFetch = g.fetch;
g.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.includes("/evidence/")) {
    try {
      const body = await readFile(join(process.cwd(), "public", new URL(url).pathname), "utf8");
      return new Response(body, { status: 200 });
    } catch {
      return new Response("not found", { status: 404 });
    }
  }
  return realFetch(input as string, init);
}) as typeof fetch;

const NOW = "2026-09-02T00:00:00.000Z";

for (const id of [2n, 6n, 42n, 7n]) {
  const card = await getAgentScorecard(id, { now: NOW });
  console.log(`\n═══ agent ${card.agent.agentId}  owner ${card.agent.owner}`);
  console.log(`    card ${card.agent.cardUri}`);
  console.log(
    `    erc8004 signal: ${card.erc8004Signal ? `rep ${card.erc8004Signal.repMean01.toFixed(2)} / val ${card.erc8004Signal.validationPassRate.toFixed(2)}` : "none"}`,
  );
  for (const c of card.capabilities) {
    const verified = c.evidence.filter((e) => e.verified === true).length;
    console.log(
      `    ${c.capability.padEnd(14)} score ${String(c.score).padStart(3)}  ${c.confidence.padEnd(6)}` +
        `  (${c.counts.total} ev, ${c.counts.distinctVerifiers} verifiers, ${verified} hash-verified)`,
    );
  }
}
