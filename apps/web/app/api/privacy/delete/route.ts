import { NextResponse } from "next/server";

import { proxyJson, unauthenticated } from "../../../../lib/bff";
import { readSessionCookie, SESSION_COOKIE_NAME } from "../../../../lib/session-cookie";
import { requireCsrf } from "../../../../lib/csrf";

/** A deletion revokes every session, so the cookie is dead either way. */
export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const refused = requireCsrf(request);
  if (refused) {
    return refused;
  }


  const response = await proxyJson("/v1/privacy/delete", request, { sessionToken: token });
  const ok = response.status >= 200 && response.status < 300;
  if (ok || response.status === 401) {
    response.cookies.delete(SESSION_COOKIE_NAME);
  }
  return response;
}
