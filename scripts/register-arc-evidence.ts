import { network } from "hardhat";
import { keccak256, stringToHex } from "viem";

const { viem } = await network.create({
  network: "arcTestnet",
});

const [wallet] = await viem.getWalletClients();
const publicClient = await viem.getPublicClient();

const registryAddress =
  "0x865BF22320f07Bf23Dc384e314d29fad8A92B939";

const registry = await viem.getContractAt(
  "EvidenceRegistry",
  registryAddress
);

const evidenceText =
  "ProofGraph EvidenceRegistry v2 capability-aware registry on Arc Public Testnet";

const evidenceHash = keccak256(
  stringToHex(evidenceText)
);

console.log("");
console.log("ProofGraph Arc Evidence Registration");
console.log("------------------------------------");
console.log("Wallet:", wallet.account.address);
console.log("Registry:", registryAddress);
console.log("Capability: Research");
console.log("Evidence:", evidenceText);
console.log("Evidence Hash:", evidenceHash);
console.log("");

const txHash = await registry.write.registerEvidence([
  wallet.account.address,
  "Research",
  evidenceHash,
]);

console.log("Transaction submitted:");
console.log(txHash);

const receipt = await publicClient.waitForTransactionReceipt({
  hash: txHash,
});

console.log("");
console.log("Transaction confirmed.");
console.log("Block:", receipt.blockNumber.toString());
console.log("Status:", receipt.status);

const count = await registry.read.evidenceCount();
const evidence = await registry.read.getEvidence([count]);

console.log("");
console.log("==============================");
console.log(" PROOFGRAPH ARC EVIDENCE LIVE ");
console.log("==============================");
console.log("Evidence Count:", count.toString());
console.log("Evidence ID:", evidence.id.toString());
console.log("Agent:", evidence.agent);
console.log("Capability:", evidence.capability);
console.log("Evidence Hash:", evidence.evidenceHash);
console.log("Verifier:", evidence.verifier);
console.log("Timestamp:", evidence.timestamp.toString());
console.log("==============================");
console.log("");
