import { NextResponse } from "next/server";

import { proxyJson, unauthenticated } from "../../../../../lib/bff";
import { readSessionCookie } from "../../../../../lib/session-cookie";

/**
 * `POST /api/admin/mentorships/break-glass` — Platform Admin with a second
 * factor and a required reason. The browser sends `mentorship_id` so the id can
 * form the upstream path; only `reason` is forwarded.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const payload = (await request.clone().json().catch(() => ({}))) as {
    mentorship_id?: unknown;
    reason?: unknown;
  };
  const mentorshipId = typeof payload.mentorship_id === "string" ? payload.mentorship_id : "";
  if (!mentorshipId) {
    return NextResponse.json(
      { code: "VALIDATION_FAILED", title: "Request validation failed" },
      { status: 422 },
    );
  }
  // Only `reason` goes upstream: the API's body allowlist documents exactly one
  // key for this route, and the id already forms the path.
  const forwarded = new Request(request.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: payload.reason }),
  });
  const response = await proxyJson(
    `/v1/admin/mentorships/${encodeURIComponent(mentorshipId)}/break-glass-read`,
    forwarded,
    { sessionToken: token },
  );
  // proxyJson rebuilds the response and drops upstream headers; this one must
  // not be cacheable by the browser either (design R3).
  response.headers.set("cache-control", "no-store");
  return response;
}
