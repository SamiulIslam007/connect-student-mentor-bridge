import { NextResponse } from "next/server";

import { proxyJson, unauthenticated } from "../../../../../../lib/bff";
import { readSessionCookie } from "../../../../../../lib/session-cookie";
import { requireCsrf } from "../../../../../../lib/csrf";

/** `POST /api/admin/accounts/{id}/reinstate` — Platform Admin with a second factor. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const refused = requireCsrf(request);
  if (refused) {
    return refused;
  }

  const { id } = await context.params;
  return proxyJson(`/v1/admin/accounts/${encodeURIComponent(id)}/reinstate`, request, {
    sessionToken: token,
  });
}
