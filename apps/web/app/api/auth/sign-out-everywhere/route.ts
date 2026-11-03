import { NextResponse } from "next/server";

import { callApi, readJson } from "../../../../lib/api";
import { unauthenticated } from "../../../../lib/bff";
import { readSessionCookie, SESSION_COOKIE_NAME } from "../../../../lib/session-cookie";

export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }

  const upstream = await callApi("/v1/auth/sign-out-everywhere", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  const payload = await readJson(upstream);

  if (!upstream.ok) {
    return NextResponse.json(payload, { status: upstream.status });
  }

  const response = NextResponse.json({ status: "signed_out_everywhere" });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
