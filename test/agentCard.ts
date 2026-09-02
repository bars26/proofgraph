import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ipfsToHttp, fetchAgentCard } from "../src/lib/agentCard.ts";

describe("agentCard", () => {
  it("ipfsToHttp rewrites ipfs:// and passes http through", () => {
    assert.equal(
      ipfsToHttp("ipfs://bafkreiabc", "https://ipfs.io/ipfs/"),
      "https://ipfs.io/ipfs/bafkreiabc",
    );
    assert.equal(
      ipfsToHttp("ipfs://ipfs/bafkreiabc", "https://ipfs.io/ipfs/"),
      "https://ipfs.io/ipfs/bafkreiabc",
    );
    assert.equal(
      ipfsToHttp("https://example.com/card.json", "https://ipfs.io/ipfs/"),
      "https://example.com/card.json",
    );
  });

  it("empty cardUri -> not ok", async () => {
    const r = await fetchAgentCard("");
    assert.equal(r.ok, false);
  });

  it("parses a card via an injected fetch (http uri)", async () => {
    const body = JSON.stringify({
      name: "AuditBot",
      description: "solidity audits",
      url: "https://auditbot.example",
      skills: ["Solidity Audit", { name: "Fuzzing" }, { id: "Formal Verification" }],
      endpoints: { a2a: "https://auditbot.example/a2a", mcp: { url: "https://auditbot.example/mcp" } },
    });
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(body, { status: 200 })) as typeof fetch;
    try {
      const r = await fetchAgentCard("https://auditbot.example/card.json");
      assert.equal(r.ok, true);
      if (!r.ok) return;
      assert.equal(r.card.name, "AuditBot");
      assert.deepEqual(r.card.skills, ["Solidity Audit", "Fuzzing", "Formal Verification"]);
      assert.equal(r.card.endpoints.a2a, "https://auditbot.example/a2a");
      assert.equal(r.card.endpoints.mcp, "https://auditbot.example/mcp");
      assert.equal(r.card.endpoints.url, "https://auditbot.example");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("non-JSON body -> not ok, does not throw", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("<html>nope</html>", { status: 200 })) as typeof fetch;
    try {
      const r = await fetchAgentCard("https://x.example/card.json");
      assert.equal(r.ok, false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
