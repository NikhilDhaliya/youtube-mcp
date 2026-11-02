// Pure OAuth checks (no I/O), shared by the endpoints and easy to unit-test.
import { createHash, timingSafeEqual } from "node:crypto";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function parseUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLoopbackHttp(url: URL) {
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}

// Why a redirect URI can't be registered, or null when it's fine: https, or http on this machine (Claude Code, desktop apps).
export function redirectUriProblem(uri: unknown): string | null {
  if (typeof uri !== "string" || !uri) return "must be a URL";
  if (uri.length > 2000) return "is too long";
  const url = parseUrl(uri);
  if (!url) return "must be a URL";
  if (uri.includes("#")) return "must not have a fragment";
  if (url.username || url.password) return "must not contain credentials";
  if (url.protocol === "https:" || isLoopbackHttp(url)) return null;
  return "must use https (or http on localhost)";
}

// Exact match, except that a loopback http URI may use any port (RFC 8252 §7.3: native apps pick a free port).
export function redirectMatches(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  const want = parseUrl(requested);
  if (!want || !isLoopbackHttp(want) || requested.includes("#")) return false;
  return registered.some((r) => {
    const have = parseUrl(r);
    return (
      !!have &&
      isLoopbackHttp(have) &&
      have.hostname === want.hostname &&
      have.pathname === want.pathname &&
      have.search === want.search
    );
  });
}

// PKCE (RFC 7636), S256 only.
export function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function isValidVerifier(verifier: unknown): verifier is string {
  return typeof verifier === "string" && /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
}

export function isValidChallenge(challenge: unknown): challenge is string {
  return typeof challenge === "string" && /^[A-Za-z0-9_-]{43}$/.test(challenge);
}

export function pkceMatches(verifier: unknown, challenge: string): boolean {
  if (!isValidVerifier(verifier)) return false;
  const a = Buffer.from(s256(verifier));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

// RFC 8707 resource indicator: this server's MCP URL (the bare origin is accepted too).
export function resourceMatches(resource: string, origin: string): boolean {
  const value = resource.replace(/\/+$/, "");
  return value === `${origin}/mcp` || value === origin;
}

// Client ID Metadata Documents: the client_id is an https URL that serves the client's metadata.
export function isMetadataClientId(clientId: string): boolean {
  return clientId.startsWith("https://");
}

function privateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host.startsWith("[")) return true; // IPv6 literals: never needed for a real client
  const ip = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ip) return false;
  const [a, b] = [Number(ip[1]), Number(ip[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

// Why a metadata-document client_id can't be used, or null.
export function metadataUrlProblem(clientId: string): string | null {
  if (clientId.length > 2000) return "is too long";
  const url = parseUrl(clientId);
  if (!url || url.protocol !== "https:") return "must be an https URL";
  if (clientId.includes("#") || url.username || url.password) return "must not have a fragment or credentials";
  if (url.pathname === "/" || url.pathname === "") return "must have a path";
  if (/\/\.{1,2}(\/|$|\?)/.test(clientId) || url.href !== clientId) return "must be a plain, normalized URL";
  if (privateHost(url.hostname)) return "must be on a public host";
  return null;
}

export type ClientRecord = { client_id: string; client_name: string | null; redirect_uris: string[] };

// Validates a fetched client metadata document against the URL it came from.
export function parseClientDocument(clientId: string, doc: unknown): { ok: true; client: ClientRecord } | { ok: false; error: string } {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { ok: false, error: "the document isn't a JSON object" };
  const d = doc as Record<string, unknown>;
  if (d.client_id !== clientId) return { ok: false, error: "its client_id doesn't match its URL" };
  if ("client_secret" in d || "client_secret_expires_at" in d) return { ok: false, error: "it must not contain a client secret" };
  const uris = d.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 20 || !uris.every((u) => typeof u === "string")) {
    return { ok: false, error: "it has no redirect_uris" };
  }
  const name = typeof d.client_name === "string" && d.client_name.trim() ? d.client_name.trim().slice(0, 120) : null;
  return { ok: true, client: { client_id: clientId, client_name: name, redirect_uris: uris as string[] } };
}

// What to call a client on the consent screen.
export function clientLabel(client: ClientRecord): string {
  if (client.client_name) return client.client_name;
  const url = parseUrl(client.client_id);
  return url ? url.hostname : "An app";
}
