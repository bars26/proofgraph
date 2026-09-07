/**
 * ProofGraph x402 demo — an orchestrator agent hires a Solidity auditor.
 *
 * The orchestrator has a task ("audit our lending market") and three candidate
 * agents. It doesn't trust their self-reported reputation, so it *buys* a
 * task-aware ProofGraph score for each one — paying USDC per query over x402 on
 * Arc — then hires the best and prints a decision receipt with the on-chain
 * settlement tx for every query it paid for.
 *
 * Prereqs (same as the self-test):
 *   1. .env.local has X402_FACILITATOR_PRIVATE_KEY (funded Arc wallet) and
 *      PROOFGRAPH_X402_FREE_PER_DAY=0 (so every query is charged).
 *   2. npm run dev -- --port 3100        (separate terminal)
 *   3. X402_BUYER_PRIVATE_KEY set to a *different* funded Arc wallet.
 *
 * Run:  X402_BUYER_PRIVATE_KEY=0x... npm run x402:demo
 */
import { makePayingFetch } from "../src/lib/x402Client";

const BASE = process.env.PROOFGRAPH_BASE_URL ?? "http://localhost:3100";
const ARCSCAN_TX = "https://testnet.arcscan.app/tx/";

const buyerKey = process.env.X402_BUYER_PRIVATE_KEY;
if (!buyerKey) throw new Error("set X402_BUYER_PRIVATE_KEY to a funded Arc wallet");

// The task the orchestrator needs done, and who it's considering.
const TASK = {
  capability: "Solidity Audit",
  brief: "Full audit of our lending market before mainnet",
  candidates: ["2", "6", "42"], // ERC-8004 agentIds
};

const CONFIDENCE_RANK: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };

type Quote = {
  agentId: string;
  score: number;
  confidence: string;
  successRate: number | null;
  evidence: number;
  topReason: string;
  tx: string | null;
};

/** Pull the settlement tx hash out of the x402 `PAYMENT-RESPONSE` header. */
function settlementTx(res: Response): string | null {
  const raw = res.headers.get("payment-response") ?? res.headers.get("x-payment-response");
  if (!raw) return null;
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64").toString()) as { transaction?: string };
    return decoded.transaction ?? null;
  } catch {
    return null;
  }
}

async function buyScore(payFetch: typeof fetch, agentId: string): Promise<Quote> {
  // `x402=require` skips the free daily allowance so the demo always pays.
  const url = `${BASE}/v2/api/score?agent=${agentId}&capability=${encodeURIComponent(TASK.capability)}&x402=require`;
  const res = await payFetch(url);
  if (!res.ok) throw new Error(`score query for agent ${agentId} failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as {
    score: number;
    confidence: string;
    successRate: number | null;
    counts: { evidence: number };
    reasons: string[];
  };
  return {
    agentId,
    score: body.score,
    confidence: body.confidence,
    successRate: body.successRate,
    evidence: body.counts.evidence,
    topReason: body.reasons[0] ?? "(no reasons)",
    tx: settlementTx(res),
  };
}

/** Higher confidence tier wins; ties broken by raw score. */
function rank(a: Quote, b: Quote): number {
  const dc = (CONFIDENCE_RANK[b.confidence] ?? 0) - (CONFIDENCE_RANK[a.confidence] ?? 0);
  return dc !== 0 ? dc : b.score - a.score;
}

const { fetch: payFetch, payerAddress } = makePayingFetch(buyerKey);

console.log("ProofGraph x402 demo — orchestrator hiring a Solidity auditor\n");
console.log(`  task       : ${TASK.brief}`);
console.log(`  capability : ${TASK.capability}`);
console.log(`  candidates : agents ${TASK.candidates.join(", ")}`);
console.log(`  buyer      : ${payerAddress}`);
console.log(`  endpoint   : ${BASE}/v2/api/score  ($0.01 / query, x402 on Arc)\n`);

const quotes: Quote[] = [];
for (const agentId of TASK.candidates) {
  process.stdout.write(`  querying agent ${agentId} ... `);
  const q = await buyScore(payFetch, agentId);
  quotes.push(q);
  console.log(
    `score ${q.score} (${q.confidence}), ${q.evidence} evidence` +
      (q.tx ? `  — paid, tx ${q.tx.slice(0, 12)}…` : "  — NOT charged"),
  );
}

quotes.sort(rank);
const winner = quotes[0];

console.log("\n── decision receipt ─────────────────────────────────────────");
console.log(`  task: ${TASK.brief}  [${TASK.capability}]\n`);
for (const q of quotes) {
  const mark = q === winner ? "→ HIRE " : "       ";
  const sr = q.successRate === null ? "n/a" : `${Math.round(q.successRate * 100)}%`;
  console.log(`  ${mark}agent ${q.agentId.padEnd(3)}  score ${String(q.score).padStart(3)}  ${q.confidence.padEnd(6)}  success ${sr}`);
  console.log(`          why: ${q.topReason}`);
  console.log(`          paid: ${q.tx ? ARCSCAN_TX + q.tx : "(free allowance / payment disabled)"}`);
}
const paidCount = quotes.filter((q) => q.tx).length;
console.log(`\n  hired agent ${winner.agentId} for "${TASK.capability}".`);
console.log(`  spent ${(paidCount * 0.01).toFixed(2)} USDC across ${paidCount} paid trust queries on Arc.`);
console.log("─────────────────────────────────────────────────────────────");
