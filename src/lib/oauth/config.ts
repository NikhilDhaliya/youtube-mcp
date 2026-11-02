import { env } from "@/lib/env";

// The connector is its own OAuth 2.1 authorization server and the MCP resource server.
export const SCOPE = "youtube";
export const ACCESS_TTL_S = 60 * 60; // 1 hour
export const REFRESH_TTL_S = 90 * 24 * 60 * 60; // 90 days
export const CODE_TTL_S = 10 * 60; // 10 minutes

export const origin = () => env.origin;
export const issuer = origin;
export const resourceUrl = () => `${origin()}/mcp`;
export const resourceMetadataUrl = () => `${origin()}/.well-known/oauth-protected-resource/mcp`;

// RFC 9728.
export function protectedResourceMetadata() {
  return {
    resource: resourceUrl(),
    authorization_servers: [issuer()],
    bearer_methods_supported: ["header"],
    scopes_supported: [SCOPE],
    resource_name: "YouTube",
  };
}

// RFC 8414, with what MCP clients look for (PKCE S256, public clients, DCR and client metadata documents).
export function authorizationServerMetadata() {
  const base = origin();
  return {
    issuer: issuer(),
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: true,
  };
}
