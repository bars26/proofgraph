import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("EvidenceRegistryModule", (m) => {
  const evidenceRegistry = m.contract("EvidenceRegistry");

  return { evidenceRegistry };
});
