import { randomBytes, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { appOrigin } from "./api";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, CSRF_TOKEN_PATH } from "./csrf-client";
import { readCookie, readSessionCookie, SESSION_MAX_AGE_SECONDS } from "./session-cookie";

/**
 * The double-submit pair (design R2): a browser-scoped random value in a cookie
 * the client helper can read, echoed in a header on every write. It is not bound
 * to the session, so a new session keeps working and the cookie is minted only
 * when absent (design R3).
 */
export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, CSRF_TOKEN_PATH };

/** The five writes with no session to abuse yet (design R5, D-158). */
export const CSRF_EXEMPT_ROUTES: readonly string[] = [
  "app/api/auth/sign-in/route.ts",
  "app/api/auth/sign-in/provider/route.ts",
  "app/api/auth/register/route.ts",
  "app/api/auth/forgot-password/route.ts",
  "app/api/auth/reset-password/route.ts",
];

/** One-deploy rollback, read per request so a restart is enough (design R7, D-159). */
export function csrfMode(): "enforce" | "off" {
  return process.env.WEB_CSRF_MODE === "off" ? "off" : "enforce";
}

export function mintCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Readable by the client helper on purpose; the session cookie stays httpOnly. */
export function csrfCookieOptions(
  production: boolean = process.env.NODE_ENV === "production",
): {
  httpOnly: false;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: false,
    sameSite: "lax",
    secure: production,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/** Constant time, and a length difference is not a secret (the value is fixed-width). */
export function sameToken(expected: string | null, offered: string | null): boolean {
  if (!expected || !offered) {
    return false;
  }
  const left = Buffer.from(expected);
  const right = Buffer.from(offered);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * The token carries the decision; `Origin` is authoritative when present
 * (design R4). A stripped `Origin`/`Referer` does not fail a matched pair, which
 * is what keeps a proxied deployment working.
 */
export function originAllowed(request: Request): boolean {
  const declared = request.headers.get("origin") ?? request.headers.get("referer");
  if (!declared) {
    return true;
  }
  try {
    return new URL(declared).origin === appOrigin();
  } catch {
    return false;
  }
}

function refusal(): NextResponse {
  return NextResponse.json(
    {
      type: "https://docs.connect.example/problems/csrf-invalid",
      title: "The request needs a CSRF token",
      status: 403,
      code: "CSRF_INVALID",
      detail: `Send the ${CSRF_HEADER_NAME} header matching the ${CSRF_COOKIE_NAME} cookie, from the app's own origin.`,
    },
    { status: 403 },
  );
}

/**
 * The guard every write route calls after its session read and before it parses
 * a body. A request with no session cookie is not authenticated, so there is
 * nothing to protect and the route's own 401 owns the answer — which is also
 * what keeps the challenged sign-in step (`/api/auth/mfa/verify`, which carries
 * only the opaque challenge cookie) working.
 */
export function requireCsrf(request: Request): NextResponse | null {
  if (csrfMode() === "off") {
    return null;
  }
  const cookieHeader = request.headers.get("cookie");
  if (!readSessionCookie(cookieHeader)) {
    return null;
  }
  if (!originAllowed(request)) {
    return refusal();
  }
  const expected = readCookie(cookieHeader, CSRF_COOKIE_NAME);
  return sameToken(expected, request.headers.get(CSRF_HEADER_NAME)) ? null : refusal();
}

/**
 * Mint the token when it is absent and the caller is signed in. An existing
 * value is left alone, so two tabs never fight over it.
 */
export function ensureCsrfToken(request: Request, response: NextResponse): NextResponse {
  const cookieHeader = request.headers.get("cookie");
  if (!readSessionCookie(cookieHeader) || readCookie(cookieHeader, CSRF_COOKIE_NAME)) {
    return response;
  }
  response.cookies.set(CSRF_COOKIE_NAME, mintCsrfToken(), csrfCookieOptions());
  return response;
}
