/**
 * Read-only check of the EvidenceRegistryV2 read layer against Arc Testnet.
 *   npx hardhat run scripts/read-v2.ts --network arcTestnet
 * Uses NEXT_PUBLIC_EVIDENCE_REGISTRY_V2 (env / .env.local) or the ignition deployment file.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Address } from "viem";

import { getAllEvidence, getAgentEvidence, getAgentCapabilityEvidence } from "../src/lib/evidenceV2";

function resolve(): Address {
  if (process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_V2) return process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_V2 as Address;
  const path = join(process.cwd(), "ignition/deployments/evidence-registry-v2/deployed_addresses.json");
  const json = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  const key = Object.keys(json).find((k) => k.includes("EvidenceRegistryV2"));
  if (!key) throw new Error("no address");
  return json[key] as Address;
}

const address = resolve();
process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_V2 = address;
console.log("Registry:", address);

const all = await getAllEvidence(address);
console.log(`\nevidenceCount → ${all.length} record(s)`);
for (const e of all.slice(0, 30)) {
  console.log(
    `  #${String(e.id).padStart(2)} agent ${e.agentId.padStart(2)} ${e.capability.padEnd(14)} ` +
      `${e.outcome.padEnd(9)} verifier ${e.verifier.slice(0, 10)} ${e.at.slice(0, 10)}`,
  );
}

if (all.length) {
  const a2 = await getAgentEvidence(2n, address);
  const a42Audit = await getAgentCapabilityEvidence(42n, "Solidity Audit", address);
  console.log(`\ngetAgentEvidence(2)                       → ${a2.length}`);
  console.log(`getAgentCapabilityEvidence(42,"Solidity Audit") → ${a42Audit.length}`);
  const verifiers = new Set(all.map((e) => e.verifier.toLowerCase()));
  console.log(`distinct verifiers                        → ${verifiers.size}`);
}
