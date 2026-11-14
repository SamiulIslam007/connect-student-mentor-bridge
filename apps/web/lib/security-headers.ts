/**
 * The web app's response headers (SEC-API-3, SEC-API-4). Data and three pure
 * functions, not config, so a test can read them without running Next's loader.
 *
 * Since `web-csp-enforce` the content security policy **enforces**. The directive
 * list is unchanged from the report-only round, so inline scripts and styles stay
 * allowed: the gain is origin and framing restriction, not protection from an
 * injected inline script (D-169). `WEB_CSP_MODE=report-only` restores the
 * reporting header for one deploy; a flip costs a restart (D-170).
 */
export type CspMode = "enforce" | "report-only";

/** Every path: the app is one origin and one document tree. */
export const WEB_SECURITY_HEADERS_SOURCE = "/(.*)";

export const WEB_CSP_POLICY = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join("; ");

/** The four headers that do not depend on the mode. */
export const WEB_SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
] as const;

/** Enforcing unless the deployment asks for the reporting header. */
export function cspMode(): CspMode {
  return process.env.WEB_CSP_MODE === "report-only" ? "report-only" : "enforce";
}

export function cspHeaderKey(mode: CspMode): string {
  return mode === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

/** Every header the web app sends, in one order, for the given mode. */
export function webSecurityHeaders(
  mode: CspMode = cspMode(),
): ReadonlyArray<{ key: string; value: string }> {
  return [{ key: cspHeaderKey(mode), value: WEB_CSP_POLICY }, ...WEB_SECURITY_HEADERS];
}
