import "server-only";
import { resourceMetadataUrl, resourceUrl, SCOPE } from "@/lib/oauth/config";
import { verifyAccessToken } from "@/lib/oauth/tokens";

// The MCP endpoint is a protected resource: every request needs a connector access token (RFC 6750 bearer header).

export type McpAuth = {
  token: string;
  clientId: string;
  scopes: string[];
  expiresAt: number;
  resource: URL;
  extra: Record<string, unknown>;
};

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

export function mcpPreflight() {
  return new Response(null, { status: 204, headers: CORS });
}

export function withCors(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [key, value] of Object.entries(CORS)) out.headers.set(key, value);
  return out;
}

function challenge(description: string, tokenGiven: boolean): Response {
  const params = [`resource_metadata="${resourceMetadataUrl()}"`, `scope="${SCOPE}"`];
  if (tokenGiven) params.push(`error="invalid_token"`, `error_description="${description}"`);
  return new Response(JSON.stringify({ error: "invalid_token", error_description: description }), {
    status: 401,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store", "WWW-Authenticate": `Bearer ${params.join(", ")}` },
  });
}

export function authenticate(req: Request): { ok: true; auth: McpAuth } | { ok: false; response: Response } {
  const match = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)\s*$/i);
  if (!match) return { ok: false, response: challenge("Connect the YouTube connector to use it.", false) };
  const grant = verifyAccessToken(match[1]);
  if (!grant) return { ok: false, response: challenge("The access token is invalid or expired.", true) };
  return {
    ok: true,
    auth: { token: match[1], clientId: grant.clientHash, scopes: [SCOPE], expiresAt: grant.expiresAt, resource: new URL(resourceUrl()), extra: {} },
  };
}
