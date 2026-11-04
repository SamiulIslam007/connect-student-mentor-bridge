import { NextResponse } from "next/server";

import { forwardUpstream, readJsonBody, unauthenticated } from "../../../../../lib/bff";
import { MFA_COOKIE_NAME, readMfaCookie } from "../../../../../lib/mfa-cookie";
import { SESSION_COOKIE_NAME, readSessionCookie, sessionCookieOptions } from "../../../../../lib/session-cookie";

/**
 * `POST /api/auth/mfa/verify` — confirms an enrollment (session cookie) or
 * completes a challenged sign-in (challenge cookie). The challenge never leaves
 * this server: the page posts only the code.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }

  const sessionToken = readSessionCookie(request.headers.get("cookie"));
  const challenge = readMfaCookie(request.headers.get("cookie"));
  if (!sessionToken && !challenge) {
    return unauthenticated();
  }

  const body: Record<string, unknown> =
    typeof parsed.value === "object" && parsed.value !== null
      ? { ...(parsed.value as Record<string, unknown>) }
      : {};
  if (challenge) {
    body.mfa_challenge = challenge;
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sessionToken) {
    headers.authorization = `Bearer ${sessionToken}`;
  }

  const outcome = await forwardUpstream("/v1/auth/mfa/verify", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (outcome.kind === "non-json") {
    return outcome.problem;
  }

  if (outcome.status < 200 || outcome.status >= 300) {
    return NextResponse.json(outcome.payload, { status: outcome.status });
  }

  const issued = outcome.payload.session_token;
  if (typeof issued !== "string" || issued.length === 0) {
    return NextResponse.json({ code: "INTERNAL_ERROR" }, { status: 500 });
  }

  const response = NextResponse.json({ status: "signed_in" });
  response.cookies.set(SESSION_COOKIE_NAME, issued, sessionCookieOptions());
  response.cookies.delete(MFA_COOKIE_NAME);
  return response;
}
