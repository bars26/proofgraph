/**
 * Wraps a route handler so it is free for the first N requests per client per day,
 * then requires an x402 USDC payment on Arc. If `X402_FACILITATOR_PRIVATE_KEY` is
 * unset, payment is disabled entirely (everything stays free) — the app still runs.
 *
 * The free-tier counter is in-memory: per instance, resets on redeploy. Fine for a
 * testnet demo; a real deployment would back it with a shared store.
 */
import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";

import { FREE_QUERIES_PER_DAY, getResourceServer, x402Route } from "./x402";

export function x402Enabled(): boolean {
  return Boolean(process.env.X402_FACILITATOR_PRIVATE_KEY);
}

const buckets = new Map<string, { day: string; count: number }>();

function clientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : "") || req.headers.get("x-real-ip") || "local";
}

/** true while the client is still inside its free daily allowance (and consumes one). */
function consumeFreeAllowance(req: NextRequest): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const key = clientKey(req);
  const b = buckets.get(key);
  if (!b || b.day !== day) {
    buckets.set(key, { day, count: 1 });
    return true;
  }
  if (b.count < FREE_QUERIES_PER_DAY) {
    b.count += 1;
    return true;
  }
  return false;
}

type Handler<T> = (req: NextRequest) => Promise<NextResponse<T>>;

/**
 * @param core         the real route handler
 * @param pathPattern  the served path (e.g. "/v2/api/score" or "/v2/api/agents/[id]")
 * @param priceUsd     e.g. "$0.01"
 * @param description  human label for the paywall / discovery
 */
export function withFreeAllowanceThenX402<T>(
  core: Handler<T>,
  pathPattern: string,
  priceUsd: string,
  description: string,
): Handler<T> {
  let paid: Handler<T> | null = null;
  const getPaid = () => {
    if (!paid) paid = withX402(core, x402Route(pathPattern, priceUsd, description), getResourceServer());
    return paid;
  };

  return async (req: NextRequest) => {
    if (!x402Enabled()) return core(req);
    if (consumeFreeAllowance(req)) return core(req);
    return getPaid()(req);
  };
}
