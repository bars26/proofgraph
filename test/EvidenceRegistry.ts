import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { keccak256, stringToHex, zeroAddress, zeroHash } from "viem";

describe("EvidenceRegistry", async function () {
  const { viem } = await network.connect();

  async function deployRegistry() {
    return viem.deployContract("EvidenceRegistry");
  }

  it("registers and reads evidence correctly", async function () {
    const registry = await deployRegistry();
    const [verifier, agent] = await viem.getWalletClients();

    const evidenceHash = keccak256(
      stringToHex("proofgraph-solidity-audit-001")
    );

    await registry.write.registerEvidence([
      agent.account.address,
      "Solidity Audit",
      evidenceHash,
    ]);

    const count = await registry.read.evidenceCount();
    assert.equal(count, 1n);

    const evidence = await registry.read.getEvidence([1n]);

    assert.equal(evidence.id, 1n);
    assert.equal(
      evidence.agent.toLowerCase(),
      agent.account.address.toLowerCase()
    );
    assert.equal(evidence.capability, "Solidity Audit");
    assert.equal(evidence.evidenceHash, evidenceHash);
    assert.equal(
      evidence.verifier.toLowerCase(),
      verifier.account.address.toLowerCase()
    );
    assert.ok(evidence.timestamp > 0n);
  });

  it("increments evidence IDs and tracks evidence per agent", async function () {
    const registry = await deployRegistry();
    const [, agent] = await viem.getWalletClients();

    const firstHash = keccak256(stringToHex("proof-001"));
    const secondHash = keccak256(stringToHex("proof-002"));

    await registry.write.registerEvidence([
      agent.account.address,
      "Research",
      firstHash,
    ]);

    await registry.write.registerEvidence([
      agent.account.address,
      "Data Analysis",
      secondHash,
    ]);

    const count = await registry.read.evidenceCount();
    const agentCount = await registry.read.getAgentEvidenceCount([
      agent.account.address,
    ]);
    const ids = await registry.read.getAgentEvidenceIds([
      agent.account.address,
    ]);

    assert.equal(count, 2n);
    assert.equal(agentCount, 2n);
    assert.deepEqual(ids, [1n, 2n]);
  });

  it("tracks evidence by capability for an agent", async function () {
    const registry = await deployRegistry();
    const [, agent] = await viem.getWalletClients();

    const firstHash = keccak256(stringToHex("proof-research-001"));
    const secondHash = keccak256(stringToHex("proof-coding-001"));

    await registry.write.registerEvidence([
      agent.account.address,
      "Research",
      firstHash,
    ]);

    await registry.write.registerEvidence([
      agent.account.address,
      "Coding",
      secondHash,
    ]);

    const researchIds = await registry.read.getAgentCapabilityEvidenceIds([
      agent.account.address,
      "Research",
    ]);

    const codingIds = await registry.read.getAgentCapabilityEvidenceIds([
      agent.account.address,
      "Coding",
    ]);

    assert.deepEqual(researchIds, [1n]);
    assert.deepEqual(codingIds, [2n]);
  });

  it("returns evidence count by capability for an agent", async function () {
    const registry = await deployRegistry();
    const [, agent] = await viem.getWalletClients();

    const researchHash = keccak256(stringToHex("count-research"));
    const codingHash = keccak256(stringToHex("count-coding"));

    await registry.write.registerEvidence([
      agent.account.address,
      "Research",
      researchHash,
    ]);

    await registry.write.registerEvidence([
      agent.account.address,
      "Research",
      researchHash,
    ]);

    await registry.write.registerEvidence([
      agent.account.address,
      "Coding",
      codingHash,
    ]);

    const researchCount =
      await registry.read.getAgentCapabilityEvidenceCount([
        agent.account.address,
        "Research",
      ]);

    const codingCount =
      await registry.read.getAgentCapabilityEvidenceCount([
        agent.account.address,
        "Coding",
      ]);

    const missingCount =
      await registry.read.getAgentCapabilityEvidenceCount([
        agent.account.address,
        "Data Analysis",
      ]);

    assert.equal(researchCount, 2n);
    assert.equal(codingCount, 1n);
    assert.equal(missingCount, 0n);
  });

  it("rejects the zero address as an agent", async function () {
    const registry = await deployRegistry();

    const evidenceHash = keccak256(stringToHex("proof-zero-agent"));

    await assert.rejects(
      registry.write.registerEvidence([
        zeroAddress,
        "Research",
        evidenceHash,
      ])
    );
  });

  it("rejects an empty capability", async function () {
    const registry = await deployRegistry();
    const [, agent] = await viem.getWalletClients();

    const evidenceHash = keccak256(stringToHex("proof-empty-capability"));

    await assert.rejects(
      registry.write.registerEvidence([
        agent.account.address,
        "",
        evidenceHash,
      ])
    );
  });

  it("rejects an empty evidence hash", async function () {
    const registry = await deployRegistry();
    const [, agent] = await viem.getWalletClients();

    await assert.rejects(
      registry.write.registerEvidence([
        agent.account.address,
        "Coding",
        zeroHash,
      ])
    );
  });

  it("rejects evidence IDs that do not exist", async function () {
    const registry = await deployRegistry();

    await assert.rejects(
      registry.read.getEvidence([1n])
    );
  });
});
