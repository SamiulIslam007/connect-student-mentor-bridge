import { NextResponse } from "next/server";

import { callApi, readJson } from "../../../lib/api";
import { unauthenticated } from "../../../lib/bff";
import { readSessionCookie } from "../../../lib/session-cookie";

/** The browser never holds the session token; this handler adds it server-side. */
export async function GET(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }

  const upstream = await callApi("/v1/me", {
    headers: { authorization: `Bearer ${token}` },
  });
  const payload = await readJson(upstream);
  return NextResponse.json(payload, { status: upstream.status });
}
