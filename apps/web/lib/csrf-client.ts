/**
 * Client-safe half of the CSRF pair: the names, the cookie read, and the one
 * helper every page uses instead of a bare `fetch` (design R6). Nothing here
 * imports a server module, so a client component can hold it.
 */

export const CSRF_COOKIE_NAME = "connect_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

/** The header the API's idempotency interceptor reads (SEC-AUDIT-015). */
export const IDEMPOTENCY_HEADER_NAME = "idempotency-key";

/** The mint route the helper calls once when the server refuses a stale token. */
export const CSRF_TOKEN_PATH = "/api/csrf";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * A double click is one user action, so it keeps one key. `shortcut: 1.5 s
 * window and a per-tab map, reopen if a retried action must outlive a reload`.
 */
const DOUBLE_SUBMIT_WINDOW_MS = 1_500;
const MAX_HELD_KEYS = 100;
const recentKeys = new Map<string, { key: string; at: number }>();

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

function randomKey(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  // shortcut: a plain-HTTP LAN origin has no Web Crypto; this key is a dedupe hint, not a secret.
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** `null` for a read: the API stores no key for a GET. */
function idempotencyKeyFor(input: RequestInfo | URL, init: RequestInit): string | null {
  if (!WRITE_METHODS.has((init.method ?? "GET").toUpperCase())) {
    return null;
  }
  const explicit = new Headers(init.headers).get(IDEMPOTENCY_HEADER_NAME);
  if (explicit) {
    return explicit;
  }
  const action = `${init.method} ${requestUrl(input)} ${typeof init.body === "string" ? init.body : ""}`;
  const now = Date.now();
  const held = recentKeys.get(action);
  if (held && now - held.at < DOUBLE_SUBMIT_WINDOW_MS) {
    return held.key;
  }
  if (recentKeys.size >= MAX_HELD_KEYS) {
    recentKeys.clear();
  }
  const key = randomKey();
  recentKeys.set(action, { key, at: now });
  return key;
}

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
  const key = idempotencyKeyFor(input, init);
  const first = new Headers(init.headers);
  const token = csrfToken();
  if (token) {
    first.set(CSRF_HEADER_NAME, token);
  }
  if (key) {
    first.set(IDEMPOTENCY_HEADER_NAME, key);
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

  // The same key: a retry after re-minting is still the same action.
  const retry = new Headers(init.headers);
  retry.set(CSRF_HEADER_NAME, fresh);
  if (key) {
    retry.set(IDEMPOTENCY_HEADER_NAME, key);
  }
  return fetch(input, { ...init, headers: retry });
}
