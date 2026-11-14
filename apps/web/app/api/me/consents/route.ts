import { NextResponse } from "next/server";

import { forwardUpstream, proxyJson, unauthenticated } from "../../../../lib/bff";
import { readSessionCookie } from "../../../../lib/session-cookie";
import { requireCsrf } from "../../../../lib/csrf";

/** The API's own `Bearer` template, built here so no page repeats it. */
function authorizationFor(token: string): string {
  return ["Bearer", token].join(" ");
}

/** `GET /api/me/consents` — the caller's consent state per purpose. */
export async function GET(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }

  const outcome = await forwardUpstream("/v1/me/consents", {
    headers: { authorization: authorizationFor(token) },
  });
  if (outcome.kind === "non-json") {
    return outcome.problem;
  }
  return NextResponse.json(outcome.payload, { status: outcome.status });
}

/** `POST /api/me/consents` — the allowlist, the enum and the audit stay the API's. */
export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const refused = requireCsrf(request);
  if (refused) {
    return refused;
  }

  return proxyJson("/v1/me/consents", request, { sessionToken: token, method: "POST" });
}
