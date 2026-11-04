import { NextResponse } from "next/server";

import { forwardUpstream, readJsonBody } from "../../../../lib/bff";
import { MFA_COOKIE_NAME, mfaCookieOptions } from "../../../../lib/mfa-cookie";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "../../../../lib/session-cookie";

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }

  const outcome = await forwardUpstream("/v1/auth/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parsed.value),
  });
  if (outcome.kind === "non-json") {
    return outcome.problem;
  }

  if (outcome.status < 200 || outcome.status >= 300) {
    return NextResponse.json(outcome.payload, { status: outcome.status });
  }

  const token = outcome.payload.session_token;
  if (outcome.payload.mfa_required === true) {
    // A withheld session: the browser keeps only the opaque challenge.
    const challenge = outcome.payload.mfa_challenge;
    if (typeof challenge !== "string" || challenge.length === 0) {
      return NextResponse.json({ code: "INTERNAL_ERROR" }, { status: 500 });
    }
    const challengeResponse = NextResponse.json({ status: "mfa_required" });
    challengeResponse.cookies.set(MFA_COOKIE_NAME, challenge, mfaCookieOptions());
    return challengeResponse;
  }

  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json({ code: "INTERNAL_ERROR" }, { status: 500 });
  }

  // The token stays in this httpOnly cookie; it is never in the response body.
  const response = NextResponse.json({ status: "signed_in" });
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return response;
}
