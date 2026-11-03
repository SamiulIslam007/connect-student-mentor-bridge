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

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}
