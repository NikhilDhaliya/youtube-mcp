import "server-only";
import { seal, unseal } from "@/lib/seal";
import {
  type ClientRecord,
  isMetadataClientId,
  metadataUrlProblem,
  parseClientDocument,
  parseUrl,
  redirectUriProblem,
} from "./validate";

// Registered clients aren't stored: the client_id is the sealed registration itself.
const PREFIX = "ytc_";
const CLIENT_TTL_S = 10 * 365 * 24 * 3600;
const METADATA_TIMEOUT_MS = 5000;
const METADATA_MAX_BYTES = 64 * 1024;

type Sealed = { r: string[]; n: string | null };

export function registerClient(
  input: unknown,
): { ok: true; body: Record<string, unknown> } | { ok: false; error: string; error_description: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "invalid_client_metadata", error_description: "Send the client metadata as a JSON object." };
  }
  const meta = input as Record<string, unknown>;
  const uris = meta.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0) {
    return { ok: false, error: "invalid_redirect_uri", error_description: "redirect_uris must list at least one URI." };
  }
  if (uris.length > 5) return { ok: false, error: "invalid_redirect_uri", error_description: "At most 5 redirect_uris." };
  for (const uri of uris) {
    const problem = redirectUriProblem(uri);
    if (problem) return { ok: false, error: "invalid_redirect_uri", error_description: `Redirect URI ${String(uri).slice(0, 200)} ${problem}.` };
  }
  const grants = meta.grant_types;
  if (grants !== undefined && (!Array.isArray(grants) || !grants.includes("authorization_code"))) {
    return { ok: false, error: "invalid_client_metadata", error_description: "grant_types must include authorization_code." };
  }
  const responses = meta.response_types;
  if (responses !== undefined && (!Array.isArray(responses) || !responses.includes("code"))) {
    return { ok: false, error: "invalid_client_metadata", error_description: "response_types must include code." };
  }
  const name = typeof meta.client_name === "string" && meta.client_name.trim() ? meta.client_name.trim().slice(0, 60) : null;
  const clientId = PREFIX + seal("client", { r: uris, n: name } satisfies Sealed, CLIENT_TTL_S);
  return {
    ok: true,
    body: {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(name ? { client_name: name } : {}),
      redirect_uris: uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "youtube",
    },
  };
}

export type ClientLookup = { ok: true; client: ClientRecord } | { ok: false; reason: string };

export async function findClient(clientId: string): Promise<ClientLookup> {
  if (!clientId || clientId.length > 3000) return { ok: false, reason: "The sign-in link doesn't say which app is asking." };
  if (clientId.startsWith(PREFIX)) {
    const opened = unseal<Sealed>("client", clientId.slice(PREFIX.length));
    if (!opened) return { ok: false, reason: "The connector doesn't know the app that sent you here." };
    return { ok: true, client: { client_id: clientId, client_name: opened.value.n, redirect_uris: opened.value.r } };
  }
  if (!isMetadataClientId(clientId)) return { ok: false, reason: "The connector doesn't know the app that sent you here." };
  const problem = metadataUrlProblem(clientId);
  if (problem) return { ok: false, reason: `The app's ID ${problem}.` };
  const fetched = await fetchClientDocument(clientId);
  const host = parseUrl(clientId)?.hostname ?? "the app";
  return fetched.ok ? fetched : { ok: false, reason: `Couldn't load the app's details from ${host}: ${fetched.error}.` };
}

async function fetchClientDocument(url: string): Promise<{ ok: true; client: ClientRecord } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: "it didn't answer" };
  }
  if (!res.ok) return { ok: false, error: `it answered ${res.status}` };
  if (Number(res.headers.get("content-length") ?? 0) > METADATA_MAX_BYTES) return { ok: false, error: "the document is too large" };
  const text = await readCapped(res, METADATA_MAX_BYTES);
  if (text === null) return { ok: false, error: "the document is too large" };
  try {
    return parseClientDocument(url, JSON.parse(text));
  } catch {
    return { ok: false, error: "the document isn't JSON" };
  }
}

async function readCapped(res: Response, max: number): Promise<string | null> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
