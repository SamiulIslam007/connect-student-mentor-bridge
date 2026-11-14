import { NextResponse } from "next/server";

import { forwardUpstream, unauthenticated } from "../../../../lib/bff";
import { readSessionCookie, SESSION_COOKIE_NAME } from "../../../../lib/session-cookie";
import { requireCsrf } from "../../../../lib/csrf";

export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const refused = requireCsrf(request);
  if (refused) {
    return refused;
  }


  const outcome = await forwardUpstream("/v1/auth/sign-out", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  if (outcome.kind === "non-json") {
    return outcome.problem;
  }

  if (outcome.status < 200 || outcome.status >= 300) {
    const response = NextResponse.json(outcome.payload, { status: outcome.status });
    if (outcome.status === 401) {
      // The session is already gone; do not leave a dead token in the browser.
      response.cookies.delete(SESSION_COOKIE_NAME);
    }
    return response;
  }

  const response = NextResponse.json({ status: "signed_out" });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
