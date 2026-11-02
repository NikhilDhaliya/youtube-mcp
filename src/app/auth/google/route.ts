import { randomBytes } from "node:crypto";
import { googleAuthUrl, type Mode } from "@/lib/google";
import { errorPage, redirect } from "@/lib/html";
import { seal } from "@/lib/seal";
import { nonceCookie, ownerOf } from "@/lib/session";

export const dynamic = "force-dynamic";

// Starts a Google round trip: ?mode=signin&next=/path (owner sign-in) or ?mode=channel (add a channel; owner only).
export function GET(req: Request) {
  const url = new URL(req.url);
  const mode: Mode = url.searchParams.get("mode") === "channel" ? "channel" : "signin";
  const next = url.searchParams.get("next") ?? "/setup";
  // Same-site paths only: no "//host" or "/\\host" (browsers read a backslash as a slash).
  if (!/^\/(?![\/\\])/.test(next) || next.includes("\\")) return errorPage("That sign-in link isn't valid.");
  if (mode === "channel" && !ownerOf(req)) return redirect(`/auth/google?mode=signin&next=${encodeURIComponent("/setup")}`);
  const nonce = randomBytes(16).toString("base64url");
  const state = seal("google-state", { mode, next, nonce }, 600);
  return redirect(googleAuthUrl(mode, state), { "Set-Cookie": nonceCookie(nonce) });
}
