/**
 * The web app's response headers (SEC-API-3, SEC-API-4). Data and pure
 * functions, not config, so a test can read them without running Next's loader.
 *
 * Since `web-csp-enforce` the content security policy **enforces**. The script
 * policy is now nonce-based: `middleware.ts` mints one nonce per request, Next
 * applies it to its own inline bootstrap, and `'unsafe-inline'` is gone from
 * `script-src` (SEC-AUDIT-017, D-261). `style-src` keeps `'unsafe-inline'`
 * because Next's CSS pipeline emits style tags the framework cannot nonce; that
 * residual is recorded as DEBT-79. `WEB_CSP_MODE=report-only` restores the
 * reporting header for one deploy.
 */
export type CspMode = "enforce" | "report-only";

/** Every path: the app is one origin and one document tree. */
export const WEB_SECURITY_HEADERS_SOURCE = "/(.*)";

/**
 * The policy for one request. A nonce is always published so a dynamically
 * rendered page can carry it; `'strict-dynamic'` is deliberately absent, because
 * it makes the browser ignore `'self'` and Next only stamps the nonce on dynamic
 * pages — a statically rendered page would lose its own chunks (verified live).
 */
export function webCspPolicy(nonce: string): string {
  if (!/^[A-Za-z0-9+/=_-]{8,}$/.test(nonce)) {
    throw new Error("a CSP nonce must be at least 8 base64url-shaped characters");
  }
  return [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}'`,
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join("; ");
}

/** The headers that do not depend on the nonce or the mode. */
export const WEB_SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
] as const;

/**
 * HSTS only where TLS is certain: the deployed host terminates HTTPS. A local
 * container answers plain HTTP, so it never sends the header (D-261).
 */
export function hstsHeader(
  environment: NodeJS.ProcessEnv = process.env,
): { key: string; value: string } | null {
  if (environment.NODE_ENV !== "production") {
    return null;
  }
  return { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" };
}

/** Enforcing unless the deployment asks for the reporting header. */
export function cspMode(): CspMode {
  return process.env.WEB_CSP_MODE === "report-only" ? "report-only" : "enforce";
}

export function cspHeaderKey(mode: CspMode): string {
  return mode === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

/** The one CSP header for a request, in the mode's own key. */
export function cspHeader(mode: CspMode, nonce: string): { key: string; value: string } {
  return { key: cspHeaderKey(mode), value: webCspPolicy(nonce) };
}

/** Every non-CSP header the web app sends, in one order. */
export function webSecurityHeaders(
  environment: NodeJS.ProcessEnv = process.env,
): ReadonlyArray<{ key: string; value: string }> {
  const hsts = hstsHeader(environment);
  return [...WEB_SECURITY_HEADERS, ...(hsts ? [hsts] : [])];
}
