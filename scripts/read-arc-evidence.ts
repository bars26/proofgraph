import {
  publicClient,
  evidenceRegistryAddress,
  evidenceRegistryAbi,
} from "../src/lib/proofgraph";

const count = await publicClient.readContract({
  address: evidenceRegistryAddress,
  abi: evidenceRegistryAbi,
  functionName: "evidenceCount",
});

console.log("");
console.log("=== PROOFGRAPH ARC LIVE READ ===");
console.log("Evidence Count:", count.toString());

if (count > 0n) {
  const evidence = await publicClient.readContract({
    address: evidenceRegistryAddress,
    abi: evidenceRegistryAbi,
    functionName: "getEvidence",
    args: [1n],
  });

  const researchCount = await publicClient.readContract({
    address: evidenceRegistryAddress,
    abi: evidenceRegistryAbi,
    functionName: "getAgentCapabilityEvidenceCount",
    args: [evidence.agent, "Research"],
  });

  console.log("Research Evidence Count:", researchCount.toString());
  console.log("");
  console.log("Evidence #1");
  console.log("ID:", evidence.id.toString());
  console.log("Agent:", evidence.agent);
  console.log("Capability:", evidence.capability);
  console.log("Evidence Hash:", evidence.evidenceHash);
  console.log("Verifier:", evidence.verifier);
  console.log("Timestamp:", evidence.timestamp.toString());
}
