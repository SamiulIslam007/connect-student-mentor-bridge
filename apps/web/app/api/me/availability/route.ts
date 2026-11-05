import { NextResponse } from "next/server";

import { forwardUpstream, proxyJson, unauthenticated } from "../../../../lib/bff";
import { readSessionCookie } from "../../../../lib/session-cookie";

/** `GET /api/me/availability?context=…` — the caller's own weekly windows. */
export async function GET(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }

  const context = new URL(request.url).searchParams.get("context");
  const path = context
    ? `/v1/me/availability?context=${encodeURIComponent(context)}`
    : "/v1/me/availability";
  const outcome = await forwardUpstream(path, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (outcome.kind === "non-json") {
    return outcome.problem;
  }
  return NextResponse.json(outcome.payload, { status: outcome.status });
}

/** `PUT /api/me/availability` — full replace for the body's context. */
export async function PUT(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  return proxyJson("/v1/me/availability", request, { sessionToken: token, method: "PUT" });
}
