import { network } from "hardhat";

const { viem } = await network.create();

console.log("\nProofGraph local evidence test starting...\n");

const [walletClient] = await viem.getWalletClients();

console.log("Agent:", walletClient.account.address);

const registry = await viem.deployContract("EvidenceRegistry");

console.log("EvidenceRegistry deployed:");
console.log(registry.address);

const evidenceHash =
  "0x8f53d63c40e22d08d197c381dd6a48f18e6cbb6265e2f5fbf6238887d16c4977";

console.log("\nRegistering evidence...");

const txHash = await registry.write.registerEvidence([
  walletClient.account.address,
  "Research",
  evidenceHash,
]);

console.log("Transaction:", txHash);

const publicClient = await viem.getPublicClient();

await publicClient.waitForTransactionReceipt({
  hash: txHash,
});

console.log("Transaction confirmed.");

const evidenceCount = await registry.read.evidenceCount();

const evidence = await registry.read.getEvidence([1n]);

const agentEvidenceIds = await registry.read.getAgentEvidenceIds([
  walletClient.account.address,
]);

console.log("\n==============================");
console.log(" PROOFGRAPH EVIDENCE VERIFIED");
console.log("==============================");

console.log("Evidence Count:", evidenceCount.toString());
console.log("Evidence ID:", evidence.id.toString());
console.log("Agent:", evidence.agent);
console.log("Capability:", evidence.capability);
console.log("Evidence Hash:", evidence.evidenceHash);
console.log("Verifier:", evidence.verifier);
console.log("Timestamp:", evidence.timestamp.toString());
console.log(
  "Agent Evidence IDs:",
  agentEvidenceIds.map((id) => id.toString())
);

console.log("==============================\n");
