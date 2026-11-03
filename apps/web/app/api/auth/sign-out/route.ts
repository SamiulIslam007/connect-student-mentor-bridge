import { NextResponse } from "next/server";

import { callApi, readJson } from "../../../../lib/api";
import { unauthenticated } from "../../../../lib/bff";
import { readSessionCookie, SESSION_COOKIE_NAME } from "../../../../lib/session-cookie";

export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }

  const upstream = await callApi("/v1/auth/sign-out", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  const payload = await readJson(upstream);

  if (!upstream.ok) {
    const response = NextResponse.json(payload, { status: upstream.status });
    if (upstream.status === 401) {
      // The session is already gone; do not leave a dead token in the browser.
      response.cookies.delete(SESSION_COOKIE_NAME);
    }
    return response;
  }

  const response = NextResponse.json({ status: "signed_out" });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
