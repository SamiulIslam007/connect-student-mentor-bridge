import { NextResponse } from "next/server";

import { proxyJson, readJsonBody, unauthenticated } from "../../../../../lib/bff";
import { readSessionCookie } from "../../../../../lib/session-cookie";
import { requireCsrf } from "../../../../../lib/csrf";

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
  const refused = requireCsrf(request);
  if (refused) {
    return refused;
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }
  const payload = parsed.value as {
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
  const response = await proxyJson(
    `/v1/admin/mentorships/${encodeURIComponent(mentorshipId)}/break-glass-read`,
    request,
    { sessionToken: token, body: { reason: payload.reason } },
  );
  // proxyJson rebuilds the response and drops upstream headers; this one must
  // not be cacheable by the browser either (design R3).
  response.headers.set("cache-control", "no-store");
  return response;
}
