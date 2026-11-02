import { registerClient } from "@/lib/oauth/clients";
import { json, preflight } from "@/lib/oauth/http";

// RFC 7591 dynamic client registration (open, as MCP clients expect). Clients are public and use PKCE.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_client_metadata", error_description: "Send the client metadata as JSON." }, 400);
  }
  const result = registerClient(body);
  if (!result.ok) return json({ error: result.error, error_description: result.error_description }, 400);
  return json(result.body, 201);
}

export const OPTIONS = preflight;
