import { NextResponse } from "next/server";

import { forwardUpstream, proxyJson, unauthenticated } from "../../../lib/bff";
import { readSessionCookie } from "../../../lib/session-cookie";

/** `GET /api/institutions` — Platform Admin only; the API enforces role and MFA. */
export async function GET(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }

  const outcome = await forwardUpstream("/v1/institutions", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (outcome.kind === "non-json") {
    return outcome.problem;
  }
  return NextResponse.json(outcome.payload, { status: outcome.status });
}

/** `POST /api/institutions` — the allowlist, the role and MFA stay the API's. */
export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  return proxyJson("/v1/institutions", request, { sessionToken: token });
}
