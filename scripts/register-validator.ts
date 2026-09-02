/**
 * Register ProofGraph's own ERC-8004 agent identity (its "validator agent").
 *   npx hardhat run scripts/register-validator.ts --network arcTestnet
 *
 * Calls IdentityRegistry.register(string agentURI) from the ARC_PRIVATE_KEY keystore
 * account, prints the new agentId. Idempotency: if this wallet already owns an agent
 * it prints that id and does nothing (override with FORCE=1).
 */
import { network } from "hardhat";
import { getContract, parseEventLogs, type Address } from "viem";

import { ERC8004, IDENTITY_REGISTRY_ABI, resolveAgentId } from "../src/lib/erc8004";

const AGENT_URI =
  process.env.PROOFGRAPH_AGENT_URI ?? "https://proofgraph-gamma.vercel.app/agent-card.json";

const { viem } = await network.create({ network: "arcTestnet" });
const publicClient = await viem.getPublicClient();
const [wallet] = await viem.getWalletClients();

console.log("Wallet   :", wallet.account.address);
console.log("Registry :", ERC8004.identityRegistry);
console.log("agentURI :", AGENT_URI);

if (process.env.FORCE !== "1") {
  try {
    const existing = await resolveAgentId(wallet.account.address);
    console.log(`\nThis wallet already owns ERC-8004 agentId ${existing}. Nothing to do.`);
    console.log("Set FORCE=1 to register another.");
    process.exit(0);
  } catch {
    // none yet — proceed
  }
}

const registry = getContract({
  address: ERC8004.identityRegistry,
  abi: IDENTITY_REGISTRY_ABI,
  client: wallet,
});

const txHash = (await registry.write.register([AGENT_URI])) as `0x${string}`;
console.log("\ntx:", txHash);
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
console.log("block:", receipt.blockNumber, "status:", receipt.status);

const events = parseEventLogs({
  abi: IDENTITY_REGISTRY_ABI,
  eventName: "Registered",
  logs: receipt.logs,
});
const reg = events[0] as unknown as { args: { agentId: bigint; owner: Address } } | undefined;

console.log("\n==============================");
console.log(" PROOFGRAPH VALIDATOR AGENT");
console.log("==============================");
console.log("agentId:", reg ? reg.args.agentId.toString() : "(check explorer)");
console.log("owner  :", reg ? reg.args.owner : wallet.account.address);
console.log("explorer:", `https://testnet.arcscan.app/tx/${txHash}`);
console.log("==============================");
