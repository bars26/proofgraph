import { corsPreflight, errorResponse, jsonResponse } from "@/lib/apiV2";
import { resolveAgentId } from "@/lib/erc8004";
import { CAPABILITIES, isCapability, scoreCapabilityApi } from "@/lib/proofgraphV2";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return corsPreflight();
}

export async function GET(request: Request) {
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
