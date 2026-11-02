// Response helpers for the OAuth endpoints: CORS (MCP clients may run in a browser), no caching, RFC 6749 errors.

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Pragma: "no-cache", ...CORS_HEADERS, ...extra },
  });
}

export function empty(status = 200): Response {
  return new Response(null, { status, headers: { "Cache-Control": "no-store", ...CORS_HEADERS } });
}

// Public metadata documents can be cached briefly.
export function metadata(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300", ...CORS_HEADERS },
  });
}

export type OAuthFailure = { error: string; error_description: string; status?: number };

export function oauthError(failure: OAuthFailure): Response {
  const { status = 400, ...body } = failure;
  return json(body, status);
}

// Token and revocation requests: form-encoded per RFC 6749, JSON accepted too. Only string values are kept.
export async function readParams(req: Request): Promise<Record<string, string> | null> {
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body = (await req.json()) as unknown;
      if (!body || typeof body !== "object" || Array.isArray(body)) return null;
      return Object.fromEntries(Object.entries(body).filter((e): e is [string, string] => typeof e[1] === "string"));
    }
    const form = new URLSearchParams(await req.text());
    const out: Record<string, string> = {};
    for (const [key, value] of form) {
      if (key in out) return null; // RFC 6749 §3.2: parameters must not repeat
      out[key] = value;
    }
    return out;
  } catch {
    return null;
  }
}

// A public client may still send its id in HTTP Basic (RFC 6749 §2.3.1); the secret part is ignored.
export function basicClientId(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
    const id = decoded.split(":")[0];
    return id ? decodeURIComponent(id.replace(/\+/g, " ")) : null;
  } catch {
    return null;
  }
}
