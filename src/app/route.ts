import { env } from "@/lib/env";
import { escape, page } from "@/lib/html";

export const dynamic = "force-dynamic";

export function GET() {
  return page(
    "YouTube MCP connector",
    `<h1>YouTube MCP connector</h1><p>A private, read-only YouTube connector for Claude and other MCP clients. Add <code>${escape(env.origin)}/mcp</code> as a custom connector.</p><a class="btn go" href="/setup">Owner setup</a>`,
  );
}
