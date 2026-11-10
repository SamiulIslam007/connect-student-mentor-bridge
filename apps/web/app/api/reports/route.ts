import { NextResponse } from "next/server";

import { proxyJson, unauthenticated } from "../../../lib/bff";
import { readSessionCookie } from "../../../lib/session-cookie";

/** `POST /api/reports` — any signed-in user; the API checks target visibility. */
export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  return proxyJson("/v1/reports", request, { sessionToken: token });
}
