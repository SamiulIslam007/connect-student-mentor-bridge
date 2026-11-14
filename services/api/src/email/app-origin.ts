/**
 * The browser-facing origin for links inside queued email. Configured, never
 * taken from a request, so a spoofed `Host` cannot move a link.
 */
export function appOrigin(): string {
  const configured = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to the local default.
    }
  }
  return "http://localhost:3000";
}
