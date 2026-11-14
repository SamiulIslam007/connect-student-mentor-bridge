import { NextResponse } from "next/server";

import { proxyJson, unauthenticated } from "../../../../lib/bff";
import { readSessionCookie } from "../../../../lib/session-cookie";
import { requireCsrf } from "../../../../lib/csrf";

/**
 * The export is a POST so it is never reachable by a link or a prefetch. The
 * body is an empty JSON object: the API takes no fields and the BFF refuses an
 * absent body.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const refused = requireCsrf(request);
  if (refused) {
    return refused;
  }


  const response = await proxyJson("/v1/privacy/export", request, { sessionToken: token });
  if (response.ok) {
    response.headers.set("cache-control", "no-store");
    response.headers.set("content-disposition", 'attachment; filename="connect-export.json"');
  }
  return response;
}
