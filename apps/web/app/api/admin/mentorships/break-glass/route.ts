import { NextResponse } from "next/server";

import { proxyJson, unauthenticated } from "../../../../../lib/bff";
import { readSessionCookie } from "../../../../../lib/session-cookie";

/**
 * `POST /api/admin/mentorships/break-glass` — Platform Admin with a second
 * factor and a required reason. The body carries `mentorship_id` and `reason`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const payload = (await request.clone().json().catch(() => ({}))) as {
    mentorship_id?: unknown;
  };
  const mentorshipId = typeof payload.mentorship_id === "string" ? payload.mentorship_id : "";
  if (!mentorshipId) {
    return NextResponse.json(
      { code: "VALIDATION_FAILED", title: "Request validation failed" },
      { status: 422 },
    );
  }
  return proxyJson(
    `/v1/admin/mentorships/${encodeURIComponent(mentorshipId)}/break-glass-read`,
    request,
    { sessionToken: token },
  );
}
