import type { NextRequest } from "next/server";

import { corsPreflight, errorResponse, jsonResponse } from "@/lib/apiV2";
import { resolveAgentId } from "@/lib/erc8004";
import { CAPABILITIES, isCapability, scoreCapabilityApi } from "@/lib/proofgraphV2";
import { withFreeAllowanceThenX402 } from "@/lib/x402Gate";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function OPTIONS() {
  return corsPreflight();
}

async function score(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agent = searchParams.get("agent");
  const capability = searchParams.get("capability");

  if (!agent) {
    return errorResponse(400, "missing ?agent", "pass a numeric ERC-8004 agentId or a 0x address");
  }
  if (!capability || !isCapability(capability)) {
    return errorResponse(400, "missing or unknown ?capability", `one of: ${CAPABILITIES.join(", ")}`);
  }

  let agentId: bigint;
  try {
    agentId = await resolveAgentId(agent);
  } catch (e) {
    return errorResponse(422, `could not resolve agent "${agent}"`, (e as Error).message);
  }

  try {
    const now = new Date().toISOString();
    const origin = new URL(request.url).origin;
    return jsonResponse(await scoreCapabilityApi(agentId, capability, now, origin));
  } catch (e) {
    return errorResponse(500, "scoring failed", (e as Error).message);
  }
}

// Free for the first N requests/client/day, then x402 (USDC on Arc). No-op if
// X402_FACILITATOR_PRIVATE_KEY is unset.
export const GET = withFreeAllowanceThenX402(
  score,
  "/v2/api/score",
  "$0.01",
  "ProofGraph task-aware trust score for one (agent, capability)",
);
