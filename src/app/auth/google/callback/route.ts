import { type Channel, channelName, channels } from "@/lib/channels";
import { env } from "@/lib/env";
import { exchangeCode, verifiedEmail } from "@/lib/google";
import { errorPage, redirect } from "@/lib/html";
import { valuePage } from "@/lib/setup-page";
import { unseal } from "@/lib/seal";
import { clearNonce, nonceOf, ownerOf, sessionCookie } from "@/lib/session";
import { channelInfo } from "@/lib/youtube";

export const dynamic = "force-dynamic";

type State = { mode: "signin" | "channel"; next: string; nonce: string };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = unseal<State>("google-state", url.searchParams.get("state") ?? "");
  if (!state || state.value.nonce !== nonceOf(req)) return errorPage("This sign-in expired or was started in another browser. Start again.");
  if (url.searchParams.get("error")) return errorPage(`Google said: ${url.searchParams.get("error")}.`);
  const code = url.searchParams.get("code");
  if (!code) return errorPage("Google didn't send a code back. Start again.");

  let tokens;
  try {
    tokens = await exchangeCode(code);
  } catch (e) {
    return errorPage((e as Error).message, 502);
  }

  if (state.value.mode === "signin") {
    const email = verifiedEmail(tokens.id_token);
    if (!email || !env.ownerEmails.includes(email)) {
      return errorPage(`${email ?? "That account"} isn't an owner of this connector. Sign in with an account in OWNER_EMAILS.`, 403);
    }
    const headers = new Headers({ Location: state.value.next, "Cache-Control": "no-store" });
    headers.append("Set-Cookie", sessionCookie(email));
    headers.append("Set-Cookie", clearNonce);
    return new Response(null, { status: 303, headers });
  }

  // Adding a channel: only a signed-in owner can finish it.
  if (!ownerOf(req)) return redirect(`/auth/google?mode=signin&next=${encodeURIComponent("/setup")}`);
  if (!tokens.refresh_token) {
    return errorPage("Google didn't return a long-lived login. Remove this app's access at myaccount.google.com/permissions, then add the channel again.");
  }
  let info;
  try {
    info = await channelInfo(tokens.access_token);
  } catch (e) {
    return errorPage((e as Error).message, 502);
  }
  if (!info) return errorPage("That Google account has no YouTube channel. Pick the account (or Brand Account) that owns the channel.");

  let existing: Channel[] = [];
  try {
    existing = channels();
  } catch {
    existing = []; // made with an old key: start a fresh list
  }
  const added: Channel = { id: info.id, name: channelName(info.handle, info.id), title: info.title, refreshToken: tokens.refresh_token };
  const list = [...existing.filter((c) => c.id !== added.id), added];
  const res = valuePage(`Added ${added.title}`, list);
  res.headers.append("Set-Cookie", clearNonce);
  return res;
}
