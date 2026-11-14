import { NextResponse } from "next/server";

import { CSRF_COOKIE_NAME, csrfCookieOptions, mintCsrfToken } from "../../../lib/csrf";
import { readCookie, readSessionCookie } from "../../../lib/session-cookie";

/**
 * `GET /api/csrf` — a token for a page that must write before it ever reads
 * `/api/me`. Only a signed-in caller gets one (design R3): an anonymous visitor
 * has no session to abuse.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const cookieHeader = request.headers.get("cookie");
  if (!readSessionCookie(cookieHeader)) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", title: "Authentication failed" },
      { status: 401 },
    );
  }

  const existing = readCookie(cookieHeader, CSRF_COOKIE_NAME);
  if (existing) {
    return NextResponse.json({ status: "unchanged" }, { headers: { "cache-control": "no-store" } });
  }

  const issued = NextResponse.json(
    { status: "issued" },
    { headers: { "cache-control": "no-store" } },
  );
  issued.cookies.set(CSRF_COOKIE_NAME, mintCsrfToken(), csrfCookieOptions());
  return issued;
}
