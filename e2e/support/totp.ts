import { createHmac } from "node:crypto";

/**
 * Six-digit TOTP for a stored secret.
 *
 * better-auth passes the decrypted secret straight to `createOTP(secret)`, and
 * `@better-auth/utils` uses the string's UTF-8 bytes as the HMAC key (only a
 * `base32:` prefix is decoded), so this mirrors that instead of decoding base32.
 */
export function totp(secret: string, atMs: number = Date.now()): string {
  const counter = Math.floor(atMs / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", Buffer.from(secret, "utf8")).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return (binary % 1_000_000).toString().padStart(6, "0");
}

/** The RFC 6238 secret, which is the ASCII string the vectors are computed over. */
export const RFC_6238_SECRET = "12345678901234567890";
