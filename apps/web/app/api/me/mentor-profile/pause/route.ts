import { NextResponse } from "next/server";

import { forwardUpstream, unauthenticated } from "../../../../../lib/bff";
import { readSessionCookie } from "../../../../../lib/session-cookie";
import { requireCsrf } from "../../../../../lib/csrf";

/** `POST /api/me/mentor-profile/pause` — no body; the mentor is the session. */
export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const refused = requireCsrf(request);
  if (refused) {
    return refused;
  }


  const outcome = await forwardUpstream("/v1/me/mentor-profile/pause", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  if (outcome.kind === "non-json") {
    return outcome.problem;
  }
  return NextResponse.json(outcome.payload, { status: outcome.status });
}
