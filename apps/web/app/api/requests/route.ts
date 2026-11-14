import { NextResponse } from "next/server";

import { forwardUpstream, proxyJson, unauthenticated } from "../../../lib/bff";
import { readSessionCookie } from "../../../lib/session-cookie";
import { requireCsrf } from "../../../lib/csrf";

/** `GET /api/requests?role=sent|received` — the caller's own lists. */
export async function GET(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const search = new URL(request.url).search;
  const outcome = await forwardUpstream(`/v1/requests${search}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (outcome.kind === "non-json") {
    return outcome.problem;
  }
  return NextResponse.json(outcome.payload, { status: outcome.status });
}

/** `POST /api/requests` — send a structured request. */
export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const refused = requireCsrf(request);
  if (refused) {
    return refused;
  }

  return proxyJson("/v1/requests", request, { sessionToken: token, method: "POST" });
}
