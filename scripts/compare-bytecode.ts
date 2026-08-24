import { network } from "hardhat";
import EvidenceRegistryArtifact from "../artifacts/contracts/EvidenceRegistry.sol/EvidenceRegistry.json" with { type: "json" };

const ADDRESS = "0x865BF22320f07Bf23Dc384e314d29fad8A92B939";

const { viem } = await network.create({
  network: "arcTestnet",
});

const publicClient = await viem.getPublicClient();

const onchain = await publicClient.getCode({
  address: ADDRESS,
});

const local = EvidenceRegistryArtifact.deployedBytecode;

console.log("");
console.log("=== ProofGraph Bytecode Check ===");
console.log("On-chain length:", onchain?.length ?? 0);
console.log("Local length:   ", local.length);
console.log("Exact match:    ", onchain?.toLowerCase() === local.toLowerCase());
console.log("");
console.log("On-chain start:", onchain?.slice(0, 100));
console.log("Local start:   ", local.slice(0, 100));
console.log("");
