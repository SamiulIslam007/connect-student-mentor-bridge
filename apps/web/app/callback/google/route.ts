import { NextResponse } from "next/server";

import { appOrigin } from "../../../lib/api";
import { forwardUpstream } from "../../../lib/bff";
import { OAUTH_STATE_COOKIE_NAME, readOauthStateCookie } from "../../../lib/mfa-cookie";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "../../../lib/session-cookie";

/**
 * The provider sends the browser back here, not to the API: the library's
 * redirect URI is this app's origin. The code and state are handed to the API
 * together with the opaque state cookie this app stored, and the resulting
 * session token goes straight into the httpOnly cookie (design D4).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stateCookie = readOauthStateCookie(request.headers.get("cookie"));

  if (!code || !state || !stateCookie) {
    return NextResponse.redirect(new URL("/sign-in?error=provider", appOrigin()));
  }

  const outcome = await forwardUpstream("/v1/auth/provider/callback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "google", code, state, state_cookie: stateCookie }),
  });

  if (outcome.kind === "non-json") {
    return NextResponse.redirect(new URL("/sign-in?error=provider", appOrigin()));
  }
  if (outcome.status < 200 || outcome.status >= 300) {
    const reason = outcome.payload.code === "ACCOUNT_SUSPENDED" ? "suspended" : "provider";
    return NextResponse.redirect(new URL(`/sign-in?error=${reason}`, appOrigin()));
  }

  const token = outcome.payload.session_token;
  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.redirect(new URL("/sign-in?error=provider", appOrigin()));
  }

  const response = NextResponse.redirect(new URL("/account", appOrigin()));
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  response.cookies.delete(OAUTH_STATE_COOKIE_NAME);
  return response;
}
