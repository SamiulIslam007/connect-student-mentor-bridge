/**
 * Client-safe half of the CSRF pair: the names, the cookie read, and the one
 * helper every page uses instead of a bare `fetch` (design R6). Nothing here
 * imports a server module, so a client component can hold it.
 */

export const CSRF_COOKIE_NAME = "connect_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

/** The mint route the helper calls once when the server refuses a stale token. */
export const CSRF_TOKEN_PATH = "/api/csrf";

function readCookieValue(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name && rest.length > 0) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function csrfToken(): string | null {
  return typeof document === "undefined" ? null : readCookieValue(document.cookie, CSRF_COOKIE_NAME);
}

/**
 * `fetch` with the token attached. A `403 CSRF_INVALID` re-mints once and retries
 * once, so a browser holding a stale cookie recovers without a reload; there is
 * no second retry, so a genuine refusal still surfaces to the page.
 */
export async function csrfFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const first = new Headers(init.headers);
  const token = csrfToken();
  if (token) {
    first.set(CSRF_HEADER_NAME, token);
  }

  const response = await fetch(input, { ...init, headers: first });
  if (response.status !== 403) {
    return response;
  }

  const body = (await response
    .clone()
    .json()
    .catch(() => ({}))) as { code?: string };
  if (body.code !== "CSRF_INVALID") {
    return response;
  }

  const minted = await fetch(CSRF_TOKEN_PATH, { cache: "no-store" });
  const fresh = minted.ok ? csrfToken() : null;
  if (!fresh) {
    return response;
  }

  const retry = new Headers(init.headers);
  retry.set(CSRF_HEADER_NAME, fresh);
  return fetch(input, { ...init, headers: retry });
}
