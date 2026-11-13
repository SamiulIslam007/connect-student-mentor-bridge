/**
 * The web app's response headers (SEC-API-3, SEC-API-4). Data, not config, so a
 * test can read it without executing Next's loader (design R3).
 *
 * The policy is **report-only** this round: enforcing it needs a browser pass
 * over the Google callback relay and the inline bootstrap Next injects, and
 * that is its own change behind its own debt row (design R4).
 */
export const WEB_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** Every path: the app is one origin and one document tree. */
export const WEB_SECURITY_HEADERS_SOURCE = "/(.*)";
