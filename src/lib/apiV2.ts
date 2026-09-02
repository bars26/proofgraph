/** Shared helpers for the /v2/api route handlers. */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
} as const;

/** BigInt-safe JSON: stringify bigints as decimal strings. */
function replacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, replacer, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

export function errorResponse(status: number, error: string, hint?: string): Response {
  return jsonResponse({ error, ...(hint ? { hint } : {}) }, status);
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
