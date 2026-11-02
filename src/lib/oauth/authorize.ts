import "server-only";
import { findClient } from "./clients";
import { issuer, origin, resourceUrl } from "./config";
import { type ClientRecord, isValidChallenge, redirectMatches, resourceMatches } from "./validate";

export type AuthorizeParams = Record<string, string | string[] | undefined>;

export type AuthorizeRequest = {
  client: ClientRecord;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  resource: string | null;
};

export type AuthorizeCheck =
  | { ok: true; request: AuthorizeRequest }
  // The client or redirect URI can't be trusted: show an error page, never redirect.
  | { ok: false; page: string }
  // Anything else goes back to the client as an OAuth error.
  | { ok: false; redirectTo: string };

const SINGLE = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"];

export async function checkAuthorizeRequest(params: AuthorizeParams): Promise<AuthorizeCheck> {
  for (const key of SINGLE) {
    if (Array.isArray(params[key])) return { ok: false, page: `The sign-in link repeats “${key}”.` };
  }
  const get = (key: string) => {
    const value = params[key];
    return typeof value === "string" && value !== "" ? value : null;
  };

  const clientId = get("client_id");
  if (!clientId) return { ok: false, page: "The sign-in link doesn't say which app is asking." };
  const found = await findClient(clientId);
  if (!found.ok) return { ok: false, page: found.reason };
  const client = found.client;

  const requested = get("redirect_uri");
  let redirectUri: string;
  if (requested) {
    if (!redirectMatches(client.redirect_uris, requested)) {
      return { ok: false, page: "The app asked to send you somewhere it didn't register, so the connector stopped here." };
    }
    redirectUri = requested;
  } else if (client.redirect_uris.length === 1) {
    redirectUri = client.redirect_uris[0];
  } else {
    return { ok: false, page: "The sign-in link doesn't say where to send you back." };
  }

  const state = get("state");
  const fail = (error: string, description: string): AuthorizeCheck => ({
    ok: false,
    redirectTo: errorRedirect(redirectUri, error, description, state),
  });
  if (get("response_type") !== "code") return fail("unsupported_response_type", "Only response_type=code is supported.");
  const challenge = get("code_challenge");
  if (!challenge) return fail("invalid_request", "code_challenge is required (PKCE).");
  if (get("code_challenge_method") !== "S256") return fail("invalid_request", "code_challenge_method must be S256.");
  if (!isValidChallenge(challenge)) return fail("invalid_request", "code_challenge isn't a valid S256 challenge.");
  const resource = get("resource");
  if (resource && !resourceMatches(resource, origin())) return fail("invalid_target", `The resource must be ${resourceUrl()}.`);

  return { ok: true, request: { client, redirectUri, codeChallenge: challenge, state, resource: resource ? resourceUrl() : null } };
}

function withParams(redirectUri: string, params: Record<string, string | null>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) if (value !== null) url.searchParams.set(key, value);
  return url.toString();
}

export function errorRedirect(redirectUri: string, error: string, description: string, state: string | null): string {
  return withParams(redirectUri, { error, error_description: description, state, iss: issuer() });
}

export function codeRedirect(redirectUri: string, code: string, state: string | null): string {
  return withParams(redirectUri, { code, state, iss: issuer() });
}
