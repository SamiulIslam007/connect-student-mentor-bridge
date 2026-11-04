import { NextResponse } from "next/server";

import { proxyJson, unauthenticated } from "../../../../../lib/bff";
import { readSessionCookie } from "../../../../../lib/session-cookie";

/** `POST /api/auth/mfa/enroll` — the URI and backup codes pass through once. */
export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  return proxyJson("/v1/auth/mfa/enroll", request, { sessionToken: token });
}
