import "server-only";
import { env } from "./env";
import { seal, unseal } from "./seal";

// The owner's browser session (for /setup and the connect page): a sealed, HttpOnly cookie holding their Google
// email, valid 12 hours. SameSite=Lax keeps it off cross-site form posts.
const COOKIE = "owner";
const TTL_S = 12 * 3600;

function cookieAttrs(maxAge: number) {
  const secure = env.origin.startsWith("https:") ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export function ownerOf(req: Request): string | null {
  const raw = readCookie(req, COOKIE);
  const opened = raw ? unseal<{ email: string }>("session", raw) : null;
  if (!opened) return null;
  return env.ownerEmails.includes(opened.value.email) ? opened.value.email : null;
}

export function sessionCookie(email: string) {
  return `${COOKIE}=${seal("session", { email }, TTL_S)}; ${cookieAttrs(TTL_S)}`;
}

// Binds a Google sign-in round trip to the browser that started it (stops login CSRF).
export function nonceCookie(nonce: string) {
  return `g_nonce=${nonce}; ${cookieAttrs(600)}`;
}

export function nonceOf(req: Request) {
  return readCookie(req, "g_nonce");
}

export const clearNonce = `g_nonce=; ${cookieAttrs(0)}`;
