/**
 * End-to-end ERC-8004 validation demo.
 *   npx hardhat run scripts/validate-demo.ts --network arcTestnet
 *
 * A requester wallet we control (seed mnemonic acct 0) registers its own ERC-8004
 * subject agent, that agent is seeded with a few EvidenceRegistryV2 records, then:
 *   1. requester (the agent's owner) calls validationRequest(ProofGraph, subjectId, uri, hash)
 *   2. ProofGraph (ARC_PRIVATE_KEY wallet) computes the task-aware score and calls
 *      validationResponse(hash, score, uri, attestationHash, capability)
 *   3. getValidationStatus(hash) is read back
 * Idempotent: registration + seeding are skipped if already done.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { network } from "hardhat";
import {
  createWalletClient,
  http,
  getContract,
  keccak256,
  toBytes,
  parseEventLogs,
  type Address,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";

import {
  arcTestnet,
  ERC8004,
  IDENTITY_REGISTRY_ABI,
  VALIDATION_REGISTRY_ABI,
  resolveAgentId,
} from "../src/lib/erc8004";
import { EVIDENCE_REGISTRY_V2_ABI } from "../src/lib/evidenceV2";
import { canonicalEvidenceJson, evidenceHashOf, type EvidenceDoc } from "../src/lib/evidenceDoc";
import { PROOFGRAPH_VALIDATOR, respondToValidation, parseRequestURI } from "../src/lib/validatorV2";
import type { Capability } from "../src/lib/proofgraphV2";

const SEED_MNEMONIC = "upgrade galaxy annual soul gossip mosquito thank betray sibling voyage ugly simple";
const BASE = process.env.PROOFGRAPH_BASE_URL ?? "http://localhost:3100";
const NOW = new Date().toISOString();
const ZERO: Address = "0x0000000000000000000000000000000000000000";
const OUTCOME = { Success: 0, Failure: 1, Disputed: 2 } as const;
const CAP_TO_VALIDATE: Capability[] = ["Solidity Audit", "Research"];

// evidence to attach to the subject agent (verifier index rotates 1,2,0 -> two seed
// verifier wallets + the deployer, for diversity)
const SUBJECT_EVIDENCE: Array<{ cap: Capability; outcome: keyof typeof OUTCOME; daysAgo: number; note: string }> = [
  { cap: "Solidity Audit", outcome: "Success", daysAgo: 40, note: "Audited a stablecoin FX router on Arc" },
  { cap: "Solidity Audit", outcome: "Success", daysAgo: 26, note: "Reentrancy + oracle review, 1 high fixed" },
  { cap: "Solidity Audit", outcome: "Success", daysAgo: 11, note: "Invariant review of an ERC-8183 escrow" },
  { cap: "Solidity Audit", outcome: "Failure", daysAgo: 33, note: "Missed an access-control gap" },
  { cap: "Research", outcome: "Success", daysAgo: 20, note: "Comparison of Arc bridging options" },
  { cap: "Research", outcome: "Success", daysAgo: 6, note: "x402 facilitator landscape note" },
];

if (!process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_V2) {
  const p = join(process.cwd(), "ignition/deployments/evidence-registry-v2/deployed_addresses.json");
  const j = JSON.parse(readFileSync(p, "utf8")) as Record<string, string>;
  const k = Object.keys(j).find((x) => x.includes("EvidenceRegistryV2"));
  if (k) process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_V2 = j[k];
}
const EVIDENCE_V2 = process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_V2 as Address;

// serve seed + demo evidence docs from local public/ so performedAt resolves offline
const g = globalThis as { fetch: typeof fetch };
const realFetch = g.fetch;
const docStore = new Map<string, string>();
g.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.includes("/evidence/")) {
    const path = new URL(url).pathname;
    if (docStore.has(path)) return new Response(docStore.get(path)!, { status: 200 });
    try {
      return new Response(await readFile(join(process.cwd(), "public", path), "utf8"), { status: 200 });
    } catch {
      return new Response("nf", { status: 404 });
    }
  }
  return realFetch(input as string, init);
}) as typeof fetch;

const { viem } = await network.create({ network: "arcTestnet" });
const publicClient = await viem.getPublicClient();
const [validatorWallet] = await viem.getWalletClients();

const acct = (i: number) => mnemonicToAccount(SEED_MNEMONIC, { addressIndex: i });
const requester = createWalletClient({ account: acct(0), chain: arcTestnet, transport: http() });
const seedVerifiers = [
  validatorWallet, // deployer
  createWalletClient({ account: acct(1), chain: arcTestnet, transport: http() }),
  createWalletClient({ account: acct(2), chain: arcTestnet, transport: http() }),
];

console.log("validator (ProofGraph):", validatorWallet.account.address, `agentId ${PROOFGRAPH_VALIDATOR.agentId}`);
console.log("requester / subject owner:", requester.account.address);

// 1. subject agent identity (register once)
let subjectId: bigint;
try {
  subjectId = await resolveAgentId(requester.account.address);
  console.log(`subject agentId ${subjectId} (existing)`);
} catch {
  const idReg = getContract({ address: ERC8004.identityRegistry, abi: IDENTITY_REGISTRY_ABI, client: requester });
  const tx = (await idReg.write.register(["https://proofgraph-gamma.vercel.app/agent-card.json"])) as `0x${string}`;
  const rc = await publicClient.waitForTransactionReceipt({ hash: tx });
  const ev = parseEventLogs({ abi: IDENTITY_REGISTRY_ABI, eventName: "Registered", logs: rc.logs })[0] as
    | { args: { agentId: bigint } }
    | undefined;
  subjectId = ev!.args.agentId;
  console.log(`subject agentId ${subjectId} (registered, tx ${tx.slice(0, 18)}…)`);
}

// 2. seed the subject agent with evidence (once)
const evReadonly = getContract({ address: EVIDENCE_V2, abi: EVIDENCE_REGISTRY_V2_ABI, client: publicClient });
const already = (await evReadonly.read.getAgentEvidenceCount([subjectId])) as bigint;
if (already === 0n) {
  console.log(`seeding ${SUBJECT_EVIDENCE.length} evidence records for agent ${subjectId}…`);
  mkdirSync(join(process.cwd(), "public/evidence"), { recursive: true });
  const anchor = Date.parse(NOW);
  for (let i = 0; i < SUBJECT_EVIDENCE.length; i++) {
    const s = SUBJECT_EVIDENCE[i];
    const doc: EvidenceDoc = {
      agentId: subjectId.toString(),
      capability: s.cap,
      outcome: s.outcome,
      performedAt: new Date(anchor - s.daysAgo * 86_400_000).toISOString(),
      taskDescription: s.note,
      sourceRef: "validate-demo",
      verifierNote: "ProofGraph validation demo evidence",
    };
    const canonical = canonicalEvidenceJson(doc);
    const fileName = `demo-${subjectId}-${String(i + 1).padStart(2, "0")}.json`;
    docStore.set(`/evidence/${fileName}`, canonical);
    writeFileSync(join(process.cwd(), "public/evidence", fileName), canonical + "\n");
    const wc = seedVerifiers[(i + 1) % seedVerifiers.length];
    const ev = getContract({ address: EVIDENCE_V2, abi: EVIDENCE_REGISTRY_V2_ABI, client: wc });
    const tx = (await ev.write.submitEvidence([
      subjectId,
      s.cap,
      OUTCOME[s.outcome],
      ZERO,
      evidenceHashOf(doc),
      `${BASE}/evidence/${fileName}`,
    ])) as `0x${string}`;
    await publicClient.waitForTransactionReceipt({ hash: tx });
    console.log(`   #${i + 1} ${s.cap}/${s.outcome} by ${wc.account.address.slice(0, 10)}`);
  }
  await new Promise((r) => setTimeout(r, 3000)); // let RPC replicas catch up after seeding
} else {
  console.log(`agent ${subjectId} already has ${already} evidence records — skipping seed`);
}

// 3. request → respond for each capability
const reqReg = getContract({ address: ERC8004.validationRegistry, abi: VALIDATION_REGISTRY_ABI, client: requester });
const readReg = getContract({ address: ERC8004.validationRegistry, abi: VALIDATION_REGISTRY_ABI, client: publicClient });

for (const capability of CAP_TO_VALIDATE) {
  console.log(`\n── validate agent ${subjectId} / ${capability}`);
  const requestURI = `${BASE}/v2/api/score?agent=${subjectId}&capability=${encodeURIComponent(capability)}`;
  const requestHash = keccak256(toBytes(`proofgraph-demo:${subjectId}:${capability}:${Date.now()}`));

  const reqTx = (await reqReg.write.validationRequest([
    PROOFGRAPH_VALIDATOR.address,
    subjectId,
    requestURI,
    requestHash,
  ])) as `0x${string}`;
  await publicClient.waitForTransactionReceipt({ hash: reqTx });
  console.log(`   request  ${requestHash.slice(0, 18)}…  tx ${reqTx.slice(0, 18)}…`);

  // testnet RPC replicas lag: wait until the request is readable before responding
  for (let i = 0; i < 20; i++) {
    try {
      await readReg.read.getValidationStatus([requestHash]);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  await new Promise((r) => setTimeout(r, 2000));

  const parsed = parseRequestURI(requestURI);
  const doRespond = () =>
    respondToValidation({
      wallet: validatorWallet,
      requestHash,
      agentId: parsed.agentId ?? subjectId,
      capability: parsed.capability ?? capability,
      now: NOW,
      baseUrl: BASE,
    });
  let res;
  try {
    res = await doRespond();
  } catch (e) {
    console.log(`   (response reverted, retrying in 4s: ${(e as Error).message})`);
    await new Promise((r) => setTimeout(r, 4000));
    res = await doRespond();
  }
  console.log(`   response score=${res.response} (${res.confidence})  tx ${res.txHash.slice(0, 18)}…`);
  console.log(`   attestationHash ${res.responseHash.slice(0, 18)}…`);

  const st = (await readReg.read.getValidationStatus([requestHash])) as readonly [
    Address,
    bigint,
    number | bigint,
    `0x${string}`,
    string,
    bigint,
  ];
  console.log(
    `   getValidationStatus → validator=${st[0].slice(0, 10)} agentId=${st[1]} response=${Number(st[2])} tag="${st[4]}"`,
  );
}

console.log(`\ndone. subject agent ${subjectId}`);
console.log(`explorer: https://testnet.arcscan.app/address/${ERC8004.validationRegistry}`);
