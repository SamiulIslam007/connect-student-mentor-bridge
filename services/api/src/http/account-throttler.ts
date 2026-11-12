import { createHash } from "node:crypto";

/**
 * The `account` throttler's key (D-118, D-119, design R2). It never returns an
 * empty string and never throws, so a request without a body account or a
 * session falls back to the caller's address instead of being refused.
 *
 * The key is a hash: an email must not appear in a throttle key, a header, or a
 * log line. The order is body account, then session credential, then address.
 */
export function accountTracker(request: Record<string, unknown>): string {
  const email = bodyEmail(request.body);
  if (email) {
    return `body:${digest(email)}`;
  }

  const credential = sessionCredential(request.headers);
  if (credential) {
    return `session:${digest(credential)}`;
  }

  const address = (request as { ip?: unknown }).ip;
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

/** A bearer token, else the session cookie's value, else the raw cookie header. */
function sessionCredential(headers: unknown): string {
  if (typeof headers !== "object" || headers === null) {
    return "";
  }
  const source = headers as Record<string, unknown>;

  const authorization = headerValue(source.authorization);
  if (authorization.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice("bearer ".length).trim();
    if (token) {
      return token;
    }
  }

  const cookie = headerValue(source.cookie);
  if (!cookie) {
    return "";
  }
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "connect_session") {
      const value = rest.join("=").trim();
      if (value) {
        return value;
      }
    }
  }
  return cookie;
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
