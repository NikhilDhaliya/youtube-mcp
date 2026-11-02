import "server-only";
import { env } from "./env";

// Google OAuth (one "Web application" client): owner sign-in (openid email) and adding a channel (read-only
// YouTube scopes, offline access so the connector gets a refresh token).

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TIMEOUT_MS = 20_000;

export const CHANNEL_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
];

export type Mode = "signin" | "channel";

export const callbackUrl = () => `${env.origin}/auth/google/callback`;

export function googleAuthUrl(mode: Mode, state: string) {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: callbackUrl(),
    response_type: "code",
    state,
    scope: mode === "signin" ? "openid email" : CHANNEL_SCOPES.join(" "),
    ...(mode === "channel" ? { access_type: "offline", prompt: "consent select_account" } : { prompt: "select_account" }),
  });
  return `${AUTH_URL}?${params}`;
}

type TokenResult = { access_token: string; expires_in: number; refresh_token?: string; id_token?: string };

async function token(body: Record<string, string>): Promise<TokenResult> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.googleClientId, client_secret: env.googleClientSecret, ...body }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.status;
    throw new Error(`Google sign-in failed (${detail})`);
  }
  return (await res.json()) as TokenResult;
}

export const exchangeCode = (code: string) => token({ code, grant_type: "authorization_code", redirect_uri: callbackUrl() });

export const refreshAccess = (refreshToken: string) => token({ refresh_token: refreshToken, grant_type: "refresh_token" });

// The verified email in an ID token we just received from Google's token endpoint over TLS (OIDC code flow), after
// checking it was issued to this client and hasn't expired.
export function verifiedEmail(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const claims = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")) as {
      iss?: string;
      aud?: string;
      exp?: number;
      email?: string;
      email_verified?: boolean;
    };
    const issuerOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
    if (!issuerOk || claims.aud !== env.googleClientId || (claims.exp ?? 0) * 1000 < Date.now()) return null;
    return claims.email && claims.email_verified ? claims.email.toLowerCase() : null;
  } catch {
    return null;
  }
}
