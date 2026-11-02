import { createMcpHandler } from "mcp-handler";
import { authenticate, mcpPreflight, withCors } from "@/lib/auth";
import { INSTRUCTIONS, registerTools } from "@/lib/tools";

// The YouTube connector: a stateless Streamable HTTP MCP server behind its own OAuth (see /oauth, /api/oauth).
const mcp = createMcpHandler(registerTools, {
  serverInfo: { name: "YouTube", version: "1.0.0" },
  instructions: INSTRUCTIONS,
});

export const maxDuration = 60;

async function handler(req: Request): Promise<Response> {
  const result = authenticate(req);
  if (!result.ok) return result.response;
  req.auth = result.auth;
  return withCors(await mcp(req));
}

export { handler as GET, handler as POST, handler as DELETE };
export const OPTIONS = mcpPreflight;
