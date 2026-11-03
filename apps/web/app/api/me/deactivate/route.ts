import { NextResponse } from "next/server";

import { callApi, readJson } from "../../../../lib/api";
import { unauthenticated } from "../../../../lib/bff";
import { readSessionCookie, SESSION_COOKIE_NAME } from "../../../../lib/session-cookie";

export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }

  const upstream = await callApi("/v1/me/deactivate", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  const payload = await readJson(upstream);
  const response = NextResponse.json(payload, { status: upstream.status });

  // Every session is revoked server-side; drop the dead cookie either way.
  if (upstream.ok || upstream.status === 401) {
    response.cookies.delete(SESSION_COOKIE_NAME);
  }
  return response;
}
