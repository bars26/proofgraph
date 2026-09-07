/**
 * End-to-end x402 check against a running dev server.
 *
 * Prereqs:
 *   1. .env.local has X402_FACILITATOR_PRIVATE_KEY (a funded Arc wallet) and
 *      PROOFGRAPH_X402_FREE_PER_DAY=0 (so every request is charged).
 *   2. npm run dev -- --port 3100     (in another terminal)
 *   3. env X402_BUYER_PRIVATE_KEY set here to a *different* funded Arc wallet.
 *
 * Run:  X402_BUYER_PRIVATE_KEY=0x... npx tsx scripts/x402-selftest.ts
 */
import { makePayingFetch } from "../src/lib/x402Client";

const BASE = process.env.PROOFGRAPH_BASE_URL ?? "http://localhost:3100";
const URL_ = `${BASE}/v2/api/score?agent=42&capability=${encodeURIComponent("Solidity Audit")}`;
const buyerKey = process.env.X402_BUYER_PRIVATE_KEY;
if (!buyerKey) throw new Error("set X402_BUYER_PRIVATE_KEY to a funded Arc wallet");

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) fail++;
};

// 1. plain fetch -> 402
const bare = await fetch(URL_);
check("unpaid request returns 402", bare.status === 402, `got ${bare.status}`);
const reqs = await bare.json().catch(() => ({}));
console.log("   payment requirements:", JSON.stringify(reqs).slice(0, 400));

// 2. paying fetch -> 200 + score + settlement
const { fetch: payFetch, payerAddress } = makePayingFetch(buyerKey);
console.log(`\n   buyer: ${payerAddress}`);
const paid = await payFetch(URL_);
check("paid request returns 200", paid.status === 200, `got ${paid.status}`);
// x402 v2 emits `PAYMENT-RESPONSE`; older servers used `X-PAYMENT-RESPONSE`.
const settlement = paid.headers.get("payment-response") ?? paid.headers.get("x-payment-response");
check("payment-response (settlement) header present", Boolean(settlement), settlement?.slice(0, 80) ?? "(none)");
const body = await paid.json().catch(() => ({}));
check(
  "response body has a score",
  typeof body.score === "number" && typeof body.confidence === "string",
  `score=${body.score} confidence=${body.confidence}`,
);

console.log(`\n${fail === 0 ? "ALL PASS" : `${fail} FAILURE(S)`}`);
process.exit(fail === 0 ? 0 : 1);
