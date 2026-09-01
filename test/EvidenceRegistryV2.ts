import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { keccak256, stringToHex, zeroHash } from "viem";

const SUCCESS = 0;
const FAILURE = 1;
const DISPUTED = 2;

const URI = "https://proofgraph.example/evidence/1.json";

describe("EvidenceRegistryV2", async function () {
  const { viem } = await network.connect();

  async function deploy() {
    return viem.deployContract("EvidenceRegistryV2");
  }

  it("submits and reads evidence with all V2 fields", async function () {
    const registry = await deploy();
    const [verifier, counterparty] = await viem.getWalletClients();

    const evidenceHash = keccak256(stringToHex("pg-v2-solidity-audit-001"));

    await registry.write.submitEvidence([
      42n,
      "Solidity Audit",
      SUCCESS,
      counterparty.account.address,
      evidenceHash,
      URI,
    ]);

    assert.equal(await registry.read.evidenceCount(), 1n);

    const e = await registry.read.getEvidence([1n]);
    assert.equal(e.id, 1n);
    assert.equal(e.agentId, 42n);
    assert.equal(e.capability, "Solidity Audit");
    assert.equal(e.outcome, SUCCESS);
    assert.equal(e.counterparty.toLowerCase(), counterparty.account.address.toLowerCase());
    assert.equal(e.evidenceHash, evidenceHash);
    assert.equal(e.uri, URI);
    assert.equal(e.verifier.toLowerCase(), verifier.account.address.toLowerCase());
    assert.ok(e.timestamp > 0n);
  });

  it("tracks evidence per agentId and per capability", async function () {
    const registry = await deploy();

    const h = (s: string) => keccak256(stringToHex(s));

    await registry.write.submitEvidence([7n, "Research", SUCCESS, zeroAddr(), h("r1"), URI]);
    await registry.write.submitEvidence([7n, "Research", FAILURE, zeroAddr(), h("r2"), URI]);
    await registry.write.submitEvidence([7n, "Coding", SUCCESS, zeroAddr(), h("c1"), URI]);
    await registry.write.submitEvidence([9n, "Research", SUCCESS, zeroAddr(), h("r3"), URI]);

    assert.equal(await registry.read.evidenceCount(), 4n);
    assert.equal(await registry.read.getAgentEvidenceCount([7n]), 3n);
    assert.deepEqual(await registry.read.getAgentEvidenceIds([7n]), [1n, 2n, 3n]);

    assert.equal(await registry.read.getAgentCapabilityEvidenceCount([7n, "Research"]), 2n);
    assert.deepEqual(await registry.read.getAgentCapabilityEvidenceIds([7n, "Research"]), [1n, 2n]);
    assert.equal(await registry.read.getAgentCapabilityEvidenceCount([7n, "Coding"]), 1n);
    assert.equal(await registry.read.getAgentCapabilityEvidenceCount([9n, "Research"]), 1n);
    assert.equal(await registry.read.getAgentCapabilityEvidenceCount([7n, "Data Analysis"]), 0n);
  });

  it("supports agentId 0 (a valid ERC-8004 token id)", async function () {
    const registry = await deploy();
    await registry.write.submitEvidence([
      0n,
      "Data Analysis",
      DISPUTED,
      zeroAddr(),
      keccak256(stringToHex("zero-agent")),
      URI,
    ]);
    assert.equal(await registry.read.getAgentEvidenceCount([0n]), 1n);
    const e = await registry.read.getEvidence([1n]);
    assert.equal(e.agentId, 0n);
    assert.equal(e.outcome, DISPUTED);
  });

  it("batch reads evidence", async function () {
    const registry = await deploy();
    const h = (s: string) => keccak256(stringToHex(s));
    await registry.write.submitEvidence([1n, "Research", SUCCESS, zeroAddr(), h("a"), URI]);
    await registry.write.submitEvidence([1n, "Coding", FAILURE, zeroAddr(), h("b"), URI]);

    const list = await registry.read.getEvidenceBatch([[1n, 2n]]);
    assert.equal(list.length, 2);
    assert.equal(list[0].capability, "Research");
    assert.equal(list[1].outcome, FAILURE);
  });

  it("rejects an empty capability", async function () {
    const registry = await deploy();
    await assert.rejects(
      registry.write.submitEvidence([1n, "", SUCCESS, zeroAddr(), keccak256(stringToHex("x")), URI]),
    );
  });

  it("rejects an empty evidence hash", async function () {
    const registry = await deploy();
    await assert.rejects(
      registry.write.submitEvidence([1n, "Coding", SUCCESS, zeroAddr(), zeroHash, URI]),
    );
  });

  it("rejects an empty uri", async function () {
    const registry = await deploy();
    await assert.rejects(
      registry.write.submitEvidence([1n, "Coding", SUCCESS, zeroAddr(), keccak256(stringToHex("x")), ""]),
    );
  });

  it("rejects an out-of-range outcome", async function () {
    const registry = await deploy();
    await assert.rejects(
      registry.write.submitEvidence([1n, "Coding", 3, zeroAddr(), keccak256(stringToHex("x")), URI]),
    );
  });

  it("rejects reads for evidence ids that do not exist", async function () {
    const registry = await deploy();
    await assert.rejects(registry.read.getEvidence([1n]));
    await assert.rejects(registry.read.getEvidenceBatch([[1n]]));
  });
});

function zeroAddr(): `0x${string}` {
  return "0x0000000000000000000000000000000000000000";
}
