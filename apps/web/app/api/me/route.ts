import { NextResponse } from "next/server";

import { forwardUpstream, unauthenticated } from "../../../lib/bff";
import { ensureCsrfToken } from "../../../lib/csrf";
import { readSessionCookie } from "../../../lib/session-cookie";

/** The browser never holds the session token; this handler adds it server-side. */
export async function GET(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }

  const outcome = await forwardUpstream("/v1/me", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (outcome.kind === "non-json") {
    return outcome.problem;
  }
  return ensureCsrfToken(request, NextResponse.json(outcome.payload, { status: outcome.status }));
}
