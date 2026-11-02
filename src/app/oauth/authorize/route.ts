import { channels } from "@/lib/channels";
import { errorPage, escape, page, redirect } from "@/lib/html";
import { type AuthorizeParams, type AuthorizeRequest, checkAuthorizeRequest, codeRedirect, errorRedirect } from "@/lib/oauth/authorize";
import { issueCode } from "@/lib/oauth/tokens";
import { clientLabel } from "@/lib/oauth/validate";
import { seal, sha256, unseal } from "@/lib/seal";
import { ownerOf } from "@/lib/session";

export const dynamic = "force-dynamic";

// OAuth 2.1 authorization endpoint for Claude (or any MCP client). Only an owner (OWNER_EMAILS, signed in with
// Google) can allow it. Nothing is stored: the consent step is a sealed value in the form.

const FIELDS = ["client_id", "redirect_uri", "code_challenge", "state", "resource"] as const;

const requestKey = (r: AuthorizeRequest) => sha256([r.client.client_id, r.redirectUri, r.codeChallenge, r.state ?? ""].join("\n"));

function hidden(fields: Record<string, string>) {
  return Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${escape(v)}">`)
    .join("");
}

function consentPage(request: AuthorizeRequest, owner: string) {
  let names = "";
  try {
    names = channels()
      .map((c) => escape(c.title))
      .join(", ");
  } catch {}
  const consent = seal("consent", { req: requestKey(request), owner }, 600);
  return page(
    "Connect YouTube",
    `<h1>Allow ${escape(clientLabel(request.client))} to read YouTube?</h1>
<p>Read-only: ${names ? `analytics for ${names}, ` : ""}plus public YouTube search and data. Signed in as ${escape(owner)}.</p>
<form method="post">${hidden({
      client_id: request.client.client_id,
      redirect_uri: request.redirectUri,
      code_challenge: request.codeChallenge,
      state: request.state ?? "",
      resource: request.resource ?? "",
      consent,
    })}<div class="row"><button class="go" name="decision" value="allow">Allow</button><button name="decision" value="cancel">Cancel</button></div></form>`,
  );
}

async function check(params: AuthorizeParams) {
  const result = await checkAuthorizeRequest(params);
  if (result.ok) return result;
  return { ok: false as const, response: "redirectTo" in result ? redirect(result.redirectTo) : errorPage(result.page) };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params: AuthorizeParams = {};
  for (const [key, value] of url.searchParams) {
    const prev = params[key];
    params[key] = prev === undefined ? value : ([] as string[]).concat(prev, value);
  }
  const result = await check(params);
  if (!result.ok) return result.response;
  const owner = ownerOf(req);
  if (!owner) return redirect(`/auth/google?mode=signin&next=${encodeURIComponent(url.pathname + url.search)}`);
  return consentPage(result.request, owner);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = { response_type: "code", code_challenge_method: "S256" };
  for (const key of FIELDS) {
    const value = form.get(key);
    if (typeof value === "string" && value) params[key] = value;
  }
  const result = await check(params);
  if (!result.ok) return result.response;
  const { request } = result;
  const owner = ownerOf(req);
  const consent = unseal<{ req: string; owner: string }>("consent", String(form.get("consent") ?? ""));
  if (!owner || !consent || consent.value.owner !== owner || consent.value.req !== requestKey(request)) {
    return errorPage("This page expired or you were signed out. Go back to Claude and connect again.");
  }
  if (form.get("decision") !== "allow") {
    return redirect(errorRedirect(request.redirectUri, "access_denied", "The request was declined.", request.state));
  }
  const code = issueCode({
    clientId: request.client.client_id,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    resource: request.resource,
  });
  return redirect(codeRedirect(request.redirectUri, code, request.state));
}
