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


  const outcome = await forwardUpstream("/v1/me/deactivate", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  if (outcome.kind === "non-json") {
    return outcome.problem;
  }

  const response = NextResponse.json(outcome.payload, { status: outcome.status });

  // Every session is revoked server-side; drop the dead cookie either way.
  const ok = outcome.status >= 200 && outcome.status < 300;
  if (ok || outcome.status === 401) {
    response.cookies.delete(SESSION_COOKIE_NAME);
  }
  return response;
}
