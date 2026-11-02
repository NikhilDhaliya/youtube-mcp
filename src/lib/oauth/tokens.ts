import "server-only";
import { seal, sha256, unseal } from "@/lib/seal";
import { ACCESS_TTL_S, CODE_TTL_S, origin, REFRESH_TTL_S, SCOPE } from "./config";
import type { OAuthFailure } from "./http";
import { pkceMatches, resourceMatches } from "./validate";

// Codes and tokens are sealed blobs (src/lib/seal.ts): nothing is stored. A code can't be used without the PKCE
// verifier only the client holds, so its 10 minutes are its only limit.

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

type Code = { c: string; r: string; p: string; res: string | null };
type Grant = { c: string }; // sha256 of the client id

const invalidGrant = (error_description: string): OAuthFailure => ({ error: "invalid_grant", error_description });
const invalidRequest = (error_description: string): OAuthFailure => ({ error: "invalid_request", error_description });

export function issueCode(input: { clientId: string; redirectUri: string; codeChallenge: string; resource: string | null }) {
  const code: Code = { c: sha256(input.clientId), r: input.redirectUri, p: input.codeChallenge, res: input.resource };
  return "ytk_" + seal("code", code, CODE_TTL_S);
}

function issueTokens(clientHash: string): TokenResponse {
  return {
    access_token: "yta_" + seal("access", { c: clientHash } satisfies Grant, ACCESS_TTL_S),
    token_type: "Bearer",
    expires_in: ACCESS_TTL_S,
    refresh_token: "ytr_" + seal("refresh", { c: clientHash } satisfies Grant, REFRESH_TTL_S),
    scope: SCOPE,
  };
}

export function exchangeCode(params: Record<string, string>, clientId: string | null): TokenResponse | OAuthFailure {
  if (!params.code) return invalidRequest("code is required.");
  if (!params.code_verifier) return invalidRequest("code_verifier is required (PKCE).");
  if (!clientId) return invalidRequest("client_id is required.");
  const opened = params.code.startsWith("ytk_") ? unseal<Code>("code", params.code.slice(4)) : null;
  if (!opened) return invalidGrant("The code is invalid or expired.");
  const code = opened.value;
  if (code.c !== sha256(clientId)) return invalidGrant("The code was issued to another client.");
  if (params.redirect_uri !== undefined && params.redirect_uri !== code.r) return invalidGrant("redirect_uri doesn't match the authorization request.");
  if (!pkceMatches(params.code_verifier, code.p)) return invalidGrant("PKCE verification failed.");
  if (params.resource && !resourceMatches(params.resource, origin())) return { error: "invalid_target", error_description: "Unknown resource." };
  return issueTokens(code.c);
}

export function refreshTokens(params: Record<string, string>, clientId: string | null): TokenResponse | OAuthFailure {
  if (!params.refresh_token) return invalidRequest("refresh_token is required.");
  const opened = params.refresh_token.startsWith("ytr_") ? unseal<Grant>("refresh", params.refresh_token.slice(4)) : null;
  if (!opened) return invalidGrant("The refresh token is invalid or expired.");
  if (clientId && sha256(clientId) !== opened.value.c) return invalidGrant("The refresh token was issued to another client.");
  if (params.resource && !resourceMatches(params.resource, origin())) return { error: "invalid_target", error_description: "Unknown resource." };
  return issueTokens(opened.value.c);
}

export function verifyAccessToken(token: string): { clientHash: string; expiresAt: number } | null {
  if (!token.startsWith("yta_")) return null;
  const opened = unseal<Grant>("access", token.slice(4));
  return opened ? { clientHash: opened.value.c, expiresAt: opened.exp } : null;
}
