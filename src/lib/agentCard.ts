/**
 * ERC-8004 Agent Card resolution.
 *
 * `IdentityRegistry.tokenURI(agentId)` points at an off-chain card (usually `ipfs://…`)
 * describing the agent — name, skills, service endpoints. Public IPFS gateways are
 * unreliable, so this is strictly best-effort: a failure never breaks a score response.
 */

const IPFS_GATEWAYS = ["https://ipfs.io/ipfs/", "https://dweb.link/ipfs/"] as const;

const PER_GATEWAY_TIMEOUT_MS = 3000;

export type AgentCard = {
  name?: string;
  description?: string;
  url?: string;
  /** normalised to a list of skill labels */
  skills: string[];
  /** e.g. { a2a: "https://…", mcp: "https://…" } — whatever the card provides */
  endpoints: Record<string, string>;
  /** the raw parsed object, capped when serialised by callers */
  raw: unknown;
};

export type AgentCardResult =
  | { ok: true; source: string; card: AgentCard }
  | { ok: false; reason: string };

export function ipfsToHttp(uri: string, gateway: string): string {
  if (uri.startsWith("ipfs://")) {
    return gateway + uri.slice("ipfs://".length).replace(/^ipfs\//, "");
  }
  return uri;
}

function normalizeSkills(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((s) => {
      if (typeof s === "string") return s;
      if (s && typeof s === "object") {
        const o = s as Record<string, unknown>;
        return String(o.name ?? o.id ?? o.skill ?? "");
      }
      return "";
    })
    .filter(Boolean);
}

function normalizeEndpoints(card: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const e = card.endpoints ?? card.services ?? card.interfaces;
  if (e && typeof e === "object") {
    for (const [k, val] of Object.entries(e as Record<string, unknown>)) {
      if (typeof val === "string") out[k] = val;
      else if (val && typeof val === "object") {
        const u = (val as Record<string, unknown>).url ?? (val as Record<string, unknown>).uri;
        if (typeof u === "string") out[k] = u;
      }
    }
  }
  if (typeof card.url === "string" && !out.url) out.url = card.url;
  return out;
}

function parseCard(raw: unknown): AgentCard {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    name: typeof o.name === "string" ? o.name : undefined,
    description: typeof o.description === "string" ? o.description : undefined,
    url: typeof o.url === "string" ? o.url : undefined,
    skills: normalizeSkills(o.skills ?? o.capabilities),
    endpoints: normalizeEndpoints(o),
    raw,
  };
}

async function fetchOne(url: string): Promise<AgentCardResult> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), PER_GATEWAY_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = JSON.parse(await res.text());
    return { ok: true, source: url, card: parseCard(raw) };
  } finally {
    clearTimeout(t);
  }
}

/** Best-effort fetch + parse of an Agent Card. Never throws. Gateways raced in parallel. */
export async function fetchAgentCard(cardUri: string): Promise<AgentCardResult> {
  if (!cardUri) return { ok: false, reason: "empty cardUri" };

  const candidates = cardUri.startsWith("ipfs://")
    ? IPFS_GATEWAYS.map((g) => ipfsToHttp(cardUri, g))
    : [cardUri];

  try {
    return await Promise.any(candidates.map(fetchOne));
  } catch {
    return { ok: false, reason: `could not fetch card from ${candidates.length} source(s)` };
  }
}
