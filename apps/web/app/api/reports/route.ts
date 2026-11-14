import { NextResponse } from "next/server";

import { proxyJson, unauthenticated } from "../../../lib/bff";
import { readSessionCookie } from "../../../lib/session-cookie";
import { requireCsrf } from "../../../lib/csrf";

/** `POST /api/reports` — any signed-in user; the API checks target visibility. */
export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const refused = requireCsrf(request);
  if (refused) {
    return refused;
  }

  return proxyJson("/v1/reports", request, { sessionToken: token });
}
