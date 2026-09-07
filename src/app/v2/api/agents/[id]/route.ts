import type { NextRequest } from "next/server";

import { corsPreflight, errorResponse, jsonResponse } from "@/lib/apiV2";
import { resolveAgentId } from "@/lib/erc8004";
import { agentScorecardApi } from "@/lib/proofgraphV2";
import { withFreeAllowanceThenX402 } from "@/lib/x402Gate";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function OPTIONS() {
  return corsPreflight();
}

async function scorecard(request: NextRequest) {
  const id = decodeURIComponent(new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "");

  let agentId: bigint;
  try {
    agentId = await resolveAgentId(id);
  } catch (e) {
    return errorResponse(422, `could not resolve agent "${id}"`, (e as Error).message);
  }

  try {
    const now = new Date().toISOString();
    const origin = new URL(request.url).origin;
    return jsonResponse(await agentScorecardApi(agentId, now, origin));
  } catch (e) {
    return errorResponse(500, "scoring failed", (e as Error).message);
  }
}

export const GET = withFreeAllowanceThenX402(
  scorecard,
  "/v2/api/agents/[id]",
  "$0.02",
  "ProofGraph full scorecard for one agent (all capabilities + ERC-8004 profile)",
);
