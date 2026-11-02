import { basicClientId, json, oauthError, preflight, readParams } from "@/lib/oauth/http";
import { exchangeCode, refreshTokens } from "@/lib/oauth/tokens";

// Token endpoint (OAuth 2.1): authorization_code with PKCE, and refresh tokens. Public clients only.
export async function POST(req: Request) {
  const params = await readParams(req);
  if (!params) return oauthError({ error: "invalid_request", error_description: "Send a form-encoded (or JSON) body without repeated parameters." });
  const fromBasic = basicClientId(req);
  if (params.client_id && fromBasic && params.client_id !== fromBasic) {
    return oauthError({ error: "invalid_request", error_description: "client_id differs between the body and the Authorization header." });
  }
  const clientId = params.client_id || fromBasic;
  try {
    const result =
      params.grant_type === "authorization_code"
        ? exchangeCode(params, clientId)
        : params.grant_type === "refresh_token"
          ? refreshTokens(params, clientId)
          : {
              error: params.grant_type ? "unsupported_grant_type" : "invalid_request",
              error_description: params.grant_type ? `grant_type ${params.grant_type} isn't supported.` : "grant_type is required.",
            };
    if ("error" in result) return oauthError(result);
    return json(result);
  } catch (error) {
    console.error("oauth token failed", error);
    return json({ error: "server_error", error_description: "Couldn't issue a token." }, 500);
  }
}

export const OPTIONS = preflight;
