import { corsPreflight, errorResponse, jsonResponse } from "@/lib/apiV2";
import { resolveAgentId } from "@/lib/erc8004";
import { agentScorecardApi } from "@/lib/proofgraphV2";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return corsPreflight();
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

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
