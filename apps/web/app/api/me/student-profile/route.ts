import { NextResponse } from "next/server";

import { proxyJson, unauthenticated } from "../../../../lib/bff";
import { readSessionCookie } from "../../../../lib/session-cookie";
import { requireCsrf } from "../../../../lib/csrf";

/** The token stays server-side; the browser sends only its httpOnly cookie. */
export async function PUT(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const refused = requireCsrf(request);
  if (refused) {
    return refused;
  }

  return proxyJson("/v1/me/student-profile", request, { sessionToken: token, method: "PUT" });
}
