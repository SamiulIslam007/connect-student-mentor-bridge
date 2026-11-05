import { NextResponse } from "next/server";

import { forwardUpstream, unauthenticated } from "../../../../../lib/bff";
import { readSessionCookie } from "../../../../../lib/session-cookie";

/** `POST /api/me/mentor-profile/pause` — no body; the mentor is the session. */
export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
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
