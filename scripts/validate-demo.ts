/**
 * End-to-end ERC-8004 validation demo.
 *   npx hardhat run scripts/validate-demo.ts --network arcTestnet
 *
 * For a couple of (agentId, capability) pairs:
 *   1. a requester wallet calls ValidationRegistry.validationRequest(proofgraph, agentId, uri, hash)
 *   2. ProofGraph (the ARC_PRIVATE_KEY wallet) computes the task-aware score and calls
 *      validationResponse(hash, score, uri, attestationHash, capability)
 *   3. read getValidationStatus(hash) back and print it
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { network } from "hardhat";
import { createWalletClient, http, getContract, keccak256, toBytes, type Address } from "viem";
import { mnemonicToAccount } from "viem/accounts";

import { arcTestnet, ERC8004, VALIDATION_REGISTRY_ABI } from "../src/lib/erc8004";
import { PROOFGRAPH_VALIDATOR, respondToValidation, parseRequestURI } from "../src/lib/validatorV2";
import type { Capability } from "../src/lib/proofgraphV2";

const SEED_MNEMONIC = "upgrade galaxy annual soul gossip mosquito thank betray sibling voyage ugly simple";
const BASE = process.env.PROOFGRAPH_BASE_URL ?? "http://localhost:3100";
const NOW = new Date().toISOString();
const PAIRS: Array<[bigint, Capability]> = [
  [2n, "Research"],
  [42n, "Solidity Audit"],
];

if (!process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_V2) {
  const p = join(process.cwd(), "ignition/deployments/evidence-registry-v2/deployed_addresses.json");
  const j = JSON.parse(readFileSync(p, "utf8")) as Record<string, string>;
  const k = Object.keys(j).find((x) => x.includes("EvidenceRegistryV2"));
  if (k) process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_V2 = j[k];
}

// serve seed evidence docs from local public/ so performedAt resolves
const g = globalThis as { fetch: typeof fetch };
const realFetch = g.fetch;
g.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.includes("/evidence/")) {
    try {
      const body = await readFile(join(process.cwd(), "public", new URL(url).pathname), "utf8");
      return new Response(body, { status: 200 });
    } catch {
      return new Response("nf", { status: 404 });
    }
  }
  return realFetch(input as string, init);
}) as typeof fetch;

const { viem } = await network.create({ network: "arcTestnet" });
const publicClient = await viem.getPublicClient();
const [validatorWallet] = await viem.getWalletClients();

if (validatorWallet.account.address.toLowerCase() !== PROOFGRAPH_VALIDATOR.address.toLowerCase()) {
  console.warn(
    `warning: ARC_PRIVATE_KEY wallet ${validatorWallet.account.address} != PROOFGRAPH_VALIDATOR.address`,
  );
}

const requester = createWalletClient({
  account: mnemonicToAccount(SEED_MNEMONIC, { addressIndex: 0 }),
  chain: arcTestnet,
  transport: http(),
});

console.log("validator (ProofGraph):", validatorWallet.account.address, `agentId ${PROOFGRAPH_VALIDATOR.agentId}`);
console.log("requester             :", requester.account.address);
console.log("");

const reqRegistry = getContract({
  address: ERC8004.validationRegistry,
  abi: VALIDATION_REGISTRY_ABI,
  client: requester,
});
const readRegistry = getContract({
  address: ERC8004.validationRegistry,
  abi: VALIDATION_REGISTRY_ABI,
  client: publicClient,
});

for (const [agentId, capability] of PAIRS) {
  const requestURI = `${BASE}/v2/api/score?agent=${agentId}&capability=${encodeURIComponent(capability)}`;
  const requestHash = keccak256(toBytes(`proofgraph-demo:${agentId}:${capability}:${Date.now()}`));

  console.log(`── agent ${agentId} / ${capability}`);
  const reqTx = (await reqRegistry.write.validationRequest([
    PROOFGRAPH_VALIDATOR.address,
    agentId,
    requestURI,
    requestHash,
  ])) as `0x${string}`;
  await publicClient.waitForTransactionReceipt({ hash: reqTx });
  console.log(`   request  ${requestHash.slice(0, 18)}…  tx ${reqTx.slice(0, 18)}…`);

  // ProofGraph recovers (agent, capability) from the request URI, then responds
  const parsed = parseRequestURI(requestURI);
  const res = await respondToValidation({
    wallet: validatorWallet,
    requestHash,
    agentId: parsed.agentId ?? agentId,
    capability: parsed.capability ?? capability,
    now: NOW,
    baseUrl: BASE,
  });
  console.log(`   response score=${res.response} (${res.confidence})  tx ${res.txHash.slice(0, 18)}…`);
  console.log(`   attestationHash ${res.responseHash.slice(0, 18)}…  uri ${res.responseURI}`);

  const status = (await readRegistry.read.getValidationStatus([requestHash])) as readonly [
    Address,
    bigint,
    number | bigint,
    `0x${string}`,
    string,
    bigint,
  ];
  console.log(
    `   on-chain status: validator=${status[0].slice(0, 10)} agentId=${status[1]} response=${Number(status[2])} tag="${status[4]}"`,
  );
  console.log("");
}

console.log("done. explorer:", `https://testnet.arcscan.app/address/${ERC8004.validationRegistry}`);
