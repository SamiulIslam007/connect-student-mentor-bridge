const API_TIMEOUT_MS = 5_000;

/** Server-side calls to the API. Browser JavaScript never calls the API directly. */
export function apiBaseUrl(): string {
  // Inside Compose the API is reachable by service name; a host run falls back
  // to the published port.
  return (
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://localhost:3001"
  );
}

const LOOPBACK_ORIGIN = "http://localhost:3000";

/**
 * Browser-facing origin for redirects (design D7). It comes from configuration,
 * never from the request, so a spoofed `Host` or `x-forwarded-proto` cannot move
 * the redirect. Only `http` and `https` are accepted; anything else falls back to
 * the local development origin.
 */
export function appOrigin(): string {
  const configured = process.env.BETTER_AUTH_URL;
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      // The web container sets this; a deployed container without it sends
      // verification links to a dead localhost page.
      console.error(
        JSON.stringify({ event: "web.invalid_app_origin", reason: "BETTER_AUTH_URL is not set" }),
      );
    }
    return LOOPBACK_ORIGIN;
  }
  try {
    const url = new URL(configured);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.origin;
    }
  } catch {
    // Fall through to the documented error below.
  }
  console.error(
    JSON.stringify({ event: "web.invalid_app_origin", reason: "BETTER_AUTH_URL is not an http(s) URL" }),
  );
  return LOOPBACK_ORIGIN;
}

/**
 * A bounded call. When the API is unreachable or too slow, the caller gets a
 * problem response instead of an unhandled rejection (the log keeps the cause).
 */
export async function callApi(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "web.api_unreachable",
        path,
        message: error instanceof Error ? error.message : "unknown error",
      }),
    );
    return new Response(
      JSON.stringify({
        type: "https://docs.connect.example/problems/internal-error",
        title: "The API is unavailable",
        status: 502,
        code: "INTERNAL_ERROR",
      }),
      { status: 502, headers: { "content-type": "application/problem+json" } },
    );
  }
}
