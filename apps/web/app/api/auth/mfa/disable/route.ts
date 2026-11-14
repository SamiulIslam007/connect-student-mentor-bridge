import { NextResponse } from "next/server";

import { forwardUpstream, readJsonBody, unauthenticated } from "../../../../../lib/bff";
import { SESSION_COOKIE_NAME, readSessionCookie, sessionCookieOptions } from "../../../../../lib/session-cookie";
import { requireCsrf } from "../../../../../lib/csrf";

/** `POST /api/auth/mfa/disable` — removing the factor rotates the session. */
export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const refused = requireCsrf(request);
  if (refused) {
    return refused;
  }


  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }

  const outcome = await forwardUpstream("/v1/auth/mfa/disable", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(parsed.value),
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

  const response = NextResponse.json({ status: "disabled" });
  response.cookies.set(SESSION_COOKIE_NAME, issued, sessionCookieOptions());
  return response;
}
