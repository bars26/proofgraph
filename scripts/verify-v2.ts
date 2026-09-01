/**
 * End-to-end off-chain verification check.
 *   npx hardhat run scripts/verify-v2.ts --network arcTestnet
 *
 * Reads every on-chain evidence record, fetches its off-chain doc (from local
 * public/ via a disk-backed fetch shim), recomputes keccak256 and compares to the
 * on-chain evidenceHash. Also runs one deliberate tamper case.
 */
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Address } from "viem";

import { getAllEvidence, verifyEvidence } from "../src/lib/evidenceV2";
import { parseAndVerify } from "../src/lib/evidenceDoc";

// hardhat run does not load .env.local — resolve from env or the ignition deployment file
if (!process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_V2) {
  const path = join(process.cwd(), "ignition/deployments/evidence-registry-v2/deployed_addresses.json");
  const json = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  const key = Object.keys(json).find((k) => k.includes("EvidenceRegistryV2"));
  if (key) process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_V2 = json[key];
}
const address = process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_V2 as Address;
console.log("Registry:", address, "\n");

// fetch shim: map any …/evidence/<file> URL to ./public/evidence/<file> on disk
const diskFetch: typeof fetch = (async (input: string | URL | Request) => {
  const url = typeof input === "string" ? input : input.toString();
  const path = new URL(url).pathname; // /evidence/seed-01.json
  const body = await readFile(join(process.cwd(), "public", path), "utf8");
  return new Response(body, { status: 200 });
}) as typeof fetch;

const all = await getAllEvidence();
console.log(`on-chain records: ${all.length}\n`);

let ok = 0;
let bad = 0;
for (const e of all) {
  const v = await verifyEvidence(e, diskFetch);
  const mark = v.verified === true ? "✅" : v.verified === false ? "❌" : "⚠️";
  if (v.verified === true) ok++;
  else bad++;
  console.log(`  ${mark} #${String(e.id).padStart(2)} agent ${e.agentId} ${e.capability.padEnd(14)} — ${v.verifyReason}`);
}

// tamper case
const raw = await readFile(join(process.cwd(), "public/evidence/seed-01.json"), "utf8");
const tampered = raw.replace('"Success"', '"Failure"');
const t = parseAndVerify(tampered, all[0].evidenceHash);
console.log(`\ntamper check (seed-01 outcome flipped): verified=${t.verified} — ${t.reason}`);

console.log(`\nsummary: ${ok} verified, ${bad} not verified`);
process.exit(bad === 0 && t.verified === false ? 0 : 1);
