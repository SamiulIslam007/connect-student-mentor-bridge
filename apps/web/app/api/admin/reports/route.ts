import { NextResponse } from "next/server";

import { forwardUpstream, unauthenticated } from "../../../../lib/bff";
import { readSessionCookie } from "../../../../lib/session-cookie";

/** `GET /api/admin/reports` — Platform Admin only; the API enforces role and MFA. */
export async function GET(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }

  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ["cursor", "limit"]) {
    const value = incoming.get(key);
    if (value !== null) {
      query.set(key, value);
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";

  const outcome = await forwardUpstream(`/v1/reports${suffix}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (outcome.kind === "non-json") {
    return outcome.problem;
  }
  return NextResponse.json(outcome.payload, { status: outcome.status });
}
