import { NextResponse } from "next/server";

import { proxyJson, unauthenticated } from "../../../../../lib/bff";
import { readSessionCookie } from "../../../../../lib/session-cookie";

/** `POST /api/me/mentor-profile/resume` — optional `{ access_mode }`, default OPEN. */
export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  return proxyJson("/v1/me/mentor-profile/resume", request, { sessionToken: token });
}
