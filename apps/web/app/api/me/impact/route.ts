import { NextResponse } from "next/server";

import { forwardUpstream, unauthenticated } from "../../../../lib/bff";
import { readSessionCookie } from "../../../../lib/session-cookie";

/** `GET /api/me/impact` — the caller's counts only, never a score. */
export async function GET(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const outcome = await forwardUpstream("/v1/me/impact", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (outcome.kind === "non-json") {
    return outcome.problem;
  }
  return NextResponse.json(outcome.payload, { status: outcome.status });
}
