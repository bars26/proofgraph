/** Smoke test: spawn the server over stdio, list tools, call a couple. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "tsx", join(here, "index.ts")],
});
const client = new Client({ name: "smoke", version: "0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name));

for (const [name, args] of [
  ["list_capabilities", {}],
  ["resolve_agent", { address_or_id: "42" }],
  ["get_agent_score", { agent: "42", capability: "Solidity Audit" }],
  ["get_agent_scorecard", { agent: "2" }],
] as const) {
  const r = await client.callTool({ name, arguments: args });
  const first = (r.content as Array<{ type: string; text?: string }>)[0];
  console.log(`\n── ${name}(${JSON.stringify(args)})  isError=${r.isError ?? false}`);
  console.log((first?.text ?? "").slice(0, 600));
}

await client.close();
