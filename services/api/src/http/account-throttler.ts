import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * The `account` throttler's key (D-118, D-119, design R2, D-253). It never
 * returns an empty string and never throws, so a request without a body account
 * or a session falls back to the caller's address instead of being refused.
 *
 * The key is a hash: an email must not appear in a throttle key, a header, or a
 * log line. The order is body account plus source, then session bearer, then
 * address.
 *
 * The account is combined with a source signal (SEC-AUDIT-005): ten failures for
 * a victim's email from one source no longer spend the victim's bucket from
 * another source.
 */
export const CLIENT_KEY_HEADER = "x-connect-client-key";
export const CLIENT_SIGNATURE_HEADER = "x-connect-client-signature";

export function accountTracker(request: Record<string, unknown>): string {
  const email = bodyEmail(request.body);
  if (email) {
    return `body:${digest(email)}:source:${digest(sourceSignal(request))}`;
  }

  const credential = bearerCredential(request.headers);
  if (credential) {
    return `session:${digest(credential)}`;
  }

  return addressKey(request);
}

/**
 * The default bucket's key (SEC-AUDIT-001). A verified BFF client is per browser;
 * a direct bearer caller is per session; the peer address is the last resort, so
 * no shared BFF address collapses every user into one bucket.
 */
export function clientTracker(request: Record<string, unknown>): string {
  const key = trustedClientKey(request);
  if (key) {
    return `client:${digest(key)}`;
  }
  const credential = bearerCredential(request.headers);
  if (credential) {
    return `session:${digest(credential)}`;
  }
  return addressKey(request);
}

/**
 * The signed BFF client key, or an empty string. A public peer cannot mint one
 * without the shared secret; `main.ts` keeps `trust proxy` false, so `req.ip` is
 * the socket peer and never a forwarding header.
 */
export function trustedClientKey(request: Record<string, unknown>): string {
  const secret = process.env.BFF_TRUST_SECRET;
  if (!secret) {
    return "";
  }
  const headers = request.headers;
  if (typeof headers !== "object" || headers === null) {
    return "";
  }
  const source = headers as Record<string, unknown>;
  const key = headerValue(source[CLIENT_KEY_HEADER]).trim();
  const signature = headerValue(source[CLIENT_SIGNATURE_HEADER]).trim();
  if (!key || !signature) {
    return "";
  }
  const expected = createHmac("sha256", secret).update(key).digest("hex");
  if (!safeEqual(expected, signature)) {
    return "";
  }
  return key;
}

/** The source half of the account bucket, before hashing. */
function sourceSignal(request: Record<string, unknown>): string {
  const key = trustedClientKey(request);
  if (key) {
    return `client:${key}`;
  }
  const credential = bearerCredential(request.headers);
  if (credential) {
    return `session:${credential}`;
  }
  return addressKey(request);
}

function addressKey(request: Record<string, unknown>): string {
  const address = request.ip;
  return `ip:${typeof address === "string" && address.length > 0 ? address : "unknown"}`;
}

/** The normalised body account identifier, or an empty string when absent. */
function bodyEmail(body: unknown): string {
  if (typeof body !== "object" || body === null) {
    return "";
  }
  const value = (body as { email?: unknown }).email;
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** A truncated bearer credential, or an empty string. */
function bearerCredential(headers: unknown): string {
  if (typeof headers !== "object" || headers === null) {
    return "";
  }
  const authorization = headerValue((headers as Record<string, unknown>).authorization);
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return authorization.slice("bearer ".length).trim();
}


function headerValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : "";
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
