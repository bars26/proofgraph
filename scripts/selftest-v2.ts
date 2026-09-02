/**
 * ProofGraph V2 self-test — asserts the whole pipeline against live Arc Testnet.
 *   npx hardhat run scripts/selftest-v2.ts --network arcTestnet
 * Exits non-zero on any failure.
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { resolveAgent } from "../src/lib/erc8004";
import { getAllEvidence, verifyEvidence } from "../src/lib/evidenceV2";
import { scoreCapability, type Capability } from "../src/lib/proofgraphV2";
import { PROOFGRAPH_VALIDATOR } from "../src/lib/validatorV2";

if (!process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_V2) {
  const p = join(process.cwd(), "ignition/deployments/evidence-registry-v2/deployed_addresses.json");
  const j = JSON.parse(readFileSync(p, "utf8")) as Record<string, string>;
  const k = Object.keys(j).find((x) => x.includes("EvidenceRegistryV2"));
  if (k) process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_V2 = j[k];
}

// serve seed evidence docs from local public/ (seed URIs point at the prod host)
const g = globalThis as { fetch: typeof fetch };
const realFetch = g.fetch;
g.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.includes("/evidence/")) {
    try {
      return new Response(await readFile(join(process.cwd(), "public", new URL(url).pathname), "utf8"), {
        status: 200,
      });
    } catch {
      return new Response("nf", { status: 404 });
    }
  }
  return realFetch(input as string, init);
}) as typeof fetch;

const NOW = new Date().toISOString();
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
};

// 1. validator identity
const validator = await resolveAgent(PROOFGRAPH_VALIDATOR.agentId);
check(
  "ProofGraph validator identity resolves",
  validator.owner.toLowerCase() === PROOFGRAPH_VALIDATOR.address.toLowerCase(),
  `agentId ${PROOFGRAPH_VALIDATOR.agentId} → ${validator.owner}`,
);

// 2. published evidence docs hash-verify
const all = await getAllEvidence();
check("evidence registry has records", all.length >= 19, `${all.length} records`);
let seedOk = 0;
let seedTotal = 0;
let otherOk = 0;
let otherTotal = 0;
for (const e of all) {
  const isSeed = e.uri.includes("/seed-");
  const ok = (await verifyEvidence(e)).verified === true;
  if (isSeed) {
    seedTotal++;
    if (ok) seedOk++;
  } else {
    otherTotal++;
    if (ok) otherOk++;
  }
}
check("every seed evidence record hash-verifies", seedOk === seedTotal && seedTotal >= 19, `${seedOk}/${seedTotal}`);
console.log(`INFO  other records (demo) hash-verify: ${otherOk}/${otherTotal}`);

// 3. seed agents score in the SPEC reference bands, with task-aware ordering
type Band = [bigint, Capability, number, number, "low" | "medium" | "high"];
const BANDS: Band[] = [
  [42n, "Solidity Audit", 58, 76, "medium"],
  [2n, "Research", 54, 70, "medium"],
  [6n, "Coding", 54, 70, "medium"],
  [7n, "Research", 38, 54, "low"],
  [2n, "Solidity Audit", 28, 46, "low"],
  [6n, "Research", 24, 44, "low"],
];
const s: Record<string, number> = {};
for (const [agentId, cap, lo, hi, conf] of BANDS) {
  const r = await scoreCapability(agentId, cap, { now: NOW });
  s[`${agentId}/${cap}`] = r.score;
  check(
    `agent ${agentId} / ${cap} in [${lo}, ${hi}] ${conf}`,
    r.score >= lo && r.score <= hi && r.confidence === conf,
    `score ${r.score} ${r.confidence}`,
  );
}
check(
  "task-aware: agent 42 audits > agent 2 audits",
  s["42/Solidity Audit"] > s["2/Solidity Audit"],
  `${s["42/Solidity Audit"]} > ${s["2/Solidity Audit"]}`,
);
check(
  "task-aware: agent 2 research > agent 6 research",
  s["2/Research"] > s["6/Research"],
  `${s["2/Research"]} > ${s["6/Research"]}`,
);

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
