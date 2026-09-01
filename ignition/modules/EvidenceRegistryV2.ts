import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("EvidenceRegistryV2Module", (m) => {
  const evidenceRegistryV2 = m.contract("EvidenceRegistryV2");

  return { evidenceRegistryV2 };
});
