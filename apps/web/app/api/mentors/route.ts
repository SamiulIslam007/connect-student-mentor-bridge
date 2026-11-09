import { NextResponse } from "next/server";

import { forwardUpstream } from "../../../lib/bff";

const FORWARDED = ["field", "language", "access_state", "cursor", "limit"] as const;

/** `GET /api/mentors` — the public directory read; no session is required. */
export async function GET(request: Request): Promise<NextResponse> {
  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of FORWARDED) {
    const value = incoming.get(key);
    if (value !== null) {
      query.set(key, value);
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";

  const outcome = await forwardUpstream(`/v1/mentors${suffix}`, {});
  if (outcome.kind === "non-json") {
    return outcome.problem;
  }
  return NextResponse.json(outcome.payload, { status: outcome.status });
}
