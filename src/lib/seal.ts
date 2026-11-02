import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "./env";

// Stateless OAuth: client ids, sign-in steps, codes and tokens are sealed (AES-256-GCM) with CONNECTOR_KEY and carry
// their own expiry, so the connector needs no database. The purpose is the associated data, so a sealed value can't
// be used as another kind. Rotating CONNECTOR_KEY signs everyone out (the only way to revoke).

function key(): Buffer {
  const k = Buffer.from(env.connectorKey, "base64");
  if (k.length !== 32) throw new Error("CONNECTOR_KEY must be 32 bytes, base64");
  return k;
}

export function seal(purpose: string, value: unknown, ttlSeconds: number): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(purpose));
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = Buffer.concat([cipher.update(JSON.stringify({ v: value, exp }), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unseal<T>(purpose: string, sealed: string): { value: T; exp: number } | null {
  try {
    if (!sealed || sealed.length > 4000) return null;
    const raw = Buffer.from(sealed, "base64url");
    if (raw.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(raw.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const { v, exp } = JSON.parse(plain) as { v: T; exp: number };
    if (typeof exp !== "number" || exp < Math.floor(Date.now() / 1000)) return null;
    return { value: v, exp };
  } catch {
    return null;
  }
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}
