import { NextResponse } from "next/server";

import { callApi, readJson } from "../../../../lib/api";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "../../../../lib/session-cookie";

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "VALIDATION_FAILED" }, { status: 422 });
  }

  const upstream = await callApi("/v1/auth/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await readJson(upstream);

  if (!upstream.ok) {
    return NextResponse.json(payload, { status: upstream.status });
  }

  const token = payload.session_token;
  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json({ code: "INTERNAL_ERROR" }, { status: 500 });
  }

  // The token stays in this httpOnly cookie; it is never in the response body.
  const response = NextResponse.json({ status: "signed_in" });
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return response;
}
