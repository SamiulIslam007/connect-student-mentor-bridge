import { createHmac } from "node:crypto";

/**
 * The BFF-to-API client identity (SEC-AUDIT-001, D-253). The browser never calls
 * the API, so the API's address bucket would otherwise measure the web container.
 * The BFF derives the key from the transport peer chain and signs it with a
 * secret the API shares; an unsigned or foreign key header is ignored upstream.
 *
 * The hosting proxy must overwrite `x-forwarded-for`; a directly exposed Next
 * server lets a caller choose its own bucket, which is a rate-limit bypass and
 * not an authentication bypass.
 */
export const CLIENT_KEY_HEADER = "x-connect-client-key";
export const CLIENT_SIGNATURE_HEADER = "x-connect-client-signature";

/** The first transport peer, else the proxy's real-IP header, else one bucket. */
export function clientKeyFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    for (const part of forwarded.split(",")) {
      const value = part.trim();
      if (value) {
        return value;
      }
    }
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp && realIp.length > 0 ? realIp : "unknown";
}

/**
 * The headers the BFF adds to its upstream call. No secret means no key: the API
 * then falls back to the peer address, which is the pre-change behavior.
 */
export function signedClientHeaders(request: Request): Record<string, string> {
  const secret = process.env.BFF_TRUST_SECRET;
  if (!secret) {
    return {};
  }
  const key = clientKeyFromRequest(request);
  return {
    [CLIENT_KEY_HEADER]: key,
    [CLIENT_SIGNATURE_HEADER]: createHmac("sha256", secret).update(key).digest("hex"),
  };
}
