/**
 * Seed EvidenceRegistryV2 on Arc Testnet with a small, clearly-labelled demo dataset.
 *
 * Run (needs the ARC_PRIVATE_KEY keystore entry):
 *   npx hardhat run scripts/seed-v2.ts --network arcTestnet
 *
 * Resolves the V2 registry address from (in order):
 *   1. env NEXT_PUBLIC_EVIDENCE_REGISTRY_V2
 *   2. ignition/deployments/evidence-registry-v2/deployed_addresses.json
 *
 * Verifier diversity: derives 3 throwaway accounts from SEED_MNEMONIC (testnet-only,
 * committed on purpose so the seed is reproducible), funds them a little gas from the
 * deployer, then round-robins evidence submissions across them.
 *
 * Idempotency: refuses to run if evidenceCount > 0 unless FORCE=1.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { network } from "hardhat";
import { mnemonicToAccount } from "viem/accounts";
import { createWalletClient, getContract, http, formatEther, parseEther, type Address } from "viem";

import { arcTestnet } from "../src/lib/erc8004.ts";
import { EVIDENCE_REGISTRY_V2_ABI } from "../src/lib/evidenceV2.ts";
import { canonicalEvidenceJson, evidenceHashOf, type EvidenceDoc } from "../src/lib/evidenceDoc.ts";

const SEED_MNEMONIC = "test test test test test test test test test test test junk"; // testnet-only, public on purpose
const VERIFIER_COUNT = 3;
const GAS_TOPUP = parseEther("2");
const GAS_MIN = parseEther("0.5");
const ZERO: Address = "0x0000000000000000000000000000000000000000";
const EVIDENCE_BASE_URL =
  process.env.PROOFGRAPH_EVIDENCE_BASE_URL ?? "https://proofgraph-gamma.vercel.app";

const OUTCOME_ENUM: Record<EvidenceDoc["outcome"], number> = { Success: 0, Failure: 1, Disputed: 2 };

// --- demo dataset (agentIds are real ERC-8004 tokens on Arc Testnet, verified Day 2) ---
function row(
  agentId: string,
  capability: EvidenceDoc["capability"],
  outcome: EvidenceDoc["outcome"],
  daysAgo: number,
  taskDescription: string,
): EvidenceDoc {
  return {
    agentId,
    capability,
    outcome,
    performedAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    taskDescription,
    sourceRef: "seed",
    verifierNote: "ProofGraph V2 seed dataset — not real production evidence",
  };
}

const ROWS: EvidenceDoc[] = [
  row("2", "Research", "Success", 72, "Comparative analysis of 4 stablecoin FX venues on Arc"),
  row("2", "Research", "Success", 51, "Liquidity depth report for USDC/EURC pools"),
  row("2", "Research", "Success", 20, "Survey of ERC-8004 adoption across L2s"),
  row("2", "Data Analysis", "Success", 44, "On-chain flow analysis of x402 settlements"),
  row("2", "Solidity Audit", "Failure", 63, "Missed a reentrancy path in a vault hook"),
  row("2", "Solidity Audit", "Disputed", 30, "Findings contested by counterparty"),

  row("6", "Coding", "Success", 66, "Built a Next.js x402 paywall middleware"),
  row("6", "Coding", "Success", 40, "Viem client + wagmi hooks for Arc USDC-as-gas"),
  row("6", "Coding", "Success", 12, "CI harness for Arc testnet forking"),
  row("6", "Solidity Audit", "Success", 55, "Reviewed an ERC-8183 job escrow contract"),
  row("6", "Research", "Failure", 48, "Shallow write-up, missing prior art"),

  row("42", "Solidity Audit", "Success", 70, "Full audit of a lending market on Arc"),
  row("42", "Solidity Audit", "Success", 58, "Signature-replay fix verified"),
  row("42", "Solidity Audit", "Success", 33, "Access-control review, 2 highs found"),
  row("42", "Solidity Audit", "Success", 9, "Gas + invariant review of FxEscrow integration"),
  row("42", "Coding", "Success", 25, "PoC exploit + patch PR"),
  row("42", "Data Analysis", "Disputed", 41, "Methodology questioned"),

  row("7", "Research", "Success", 15, "One-off market note"),
  row("7", "Coding", "Success", 5, "Small script contribution"),
];

function resolveRegistry(): Address {
  if (process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_V2) {
    return process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_V2 as Address;
  }
  const path = join(process.cwd(), "ignition/deployments/evidence-registry-v2/deployed_addresses.json");
  const json = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  const key = Object.keys(json).find((k) => k.includes("EvidenceRegistryV2"));
  if (!key) throw new Error(`No EvidenceRegistryV2 address in ${path}`);
  return json[key] as Address;
}

// --- run ------------------------------------------------------------------------
const { viem } = await network.create({ network: "arcTestnet" });
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

const registryAddress = resolveRegistry();
console.log("Registry :", registryAddress);
console.log("Deployer :", deployer.account.address);

const readRegistry = getContract({
  address: registryAddress,
  abi: EVIDENCE_REGISTRY_V2_ABI,
  client: publicClient,
});

const existing = (await readRegistry.read.evidenceCount()) as bigint;
if (existing > 0n && process.env.FORCE !== "1") {
  console.log(`\nevidenceCount = ${existing}. Refusing to add more. Set FORCE=1 to override.`);
  process.exit(0);
}

const verifierClients = Array.from({ length: VERIFIER_COUNT }, (_, i) => {
  const account = mnemonicToAccount(SEED_MNEMONIC, { addressIndex: i });
  return createWalletClient({ account, chain: arcTestnet, transport: http() });
});
console.log("Verifiers:", verifierClients.map((c) => c.account.address).join(", "));

for (const c of verifierClients) {
  const bal = await publicClient.getBalance({ address: c.account.address });
  if (bal < GAS_MIN) {
    console.log(`  top up ${c.account.address}: ${formatEther(bal)} -> +${formatEther(GAS_TOPUP)}`);
    const hash = await deployer.sendTransaction({ to: c.account.address, value: GAS_TOPUP });
    await publicClient.waitForTransactionReceipt({ hash });
  }
}

mkdirSync(join(process.cwd(), "public/evidence"), { recursive: true });

let n = 0;
for (const doc of ROWS) {
  const canonical = canonicalEvidenceJson(doc);
  const hash = evidenceHashOf(doc);
  const fileName = `seed-${String(++n).padStart(2, "0")}.json`;
  writeFileSync(join(process.cwd(), "public/evidence", fileName), canonical + "\n");
  const uri = `${EVIDENCE_BASE_URL}/evidence/${fileName}`;

  const client = verifierClients[(n - 1) % verifierClients.length];
  const write = getContract({ address: registryAddress, abi: EVIDENCE_REGISTRY_V2_ABI, client });

  const txHash = (await write.write.submitEvidence([
    BigInt(doc.agentId),
    doc.capability,
    OUTCOME_ENUM[doc.outcome],
    ZERO,
    hash,
    uri,
  ])) as `0x${string}`;
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(
    `  #${n} agent ${doc.agentId} ${doc.capability}/${doc.outcome} ` +
      `by ${client.account.address.slice(0, 10)} -> block ${receipt.blockNumber} (${receipt.status})`,
  );
}

const total = (await readRegistry.read.evidenceCount()) as bigint;
console.log(`\nDone. evidenceCount = ${total}`);
console.log(`Explorer: https://testnet.arcscan.app/address/${registryAddress}`);
