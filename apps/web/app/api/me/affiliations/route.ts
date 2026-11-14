import { NextResponse } from "next/server";

import { proxyJson, unauthenticated } from "../../../../lib/bff";
import { readSessionCookie } from "../../../../lib/session-cookie";
import { requireCsrf } from "../../../../lib/csrf";

/** `POST /api/me/affiliations` — claim one institution for the signed-in user. */
export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const refused = requireCsrf(request);
  if (refused) {
    return refused;
  }

  return proxyJson("/v1/me/affiliations", request, { sessionToken: token, method: "POST" });
}
