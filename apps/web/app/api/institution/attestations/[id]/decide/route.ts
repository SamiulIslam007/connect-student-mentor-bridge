import { NextResponse } from "next/server";

import { proxyJson, unauthenticated } from "../../../../../../lib/bff";
import { readSessionCookie } from "../../../../../../lib/session-cookie";

/** `POST /api/institution/attestations/{id}/decide` — verify or reject one claim. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const { id } = await context.params;
  return proxyJson(`/v1/institution/affiliations/${encodeURIComponent(id)}/decide`, request, {
    sessionToken: token,
  });
}
