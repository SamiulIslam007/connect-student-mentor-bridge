import { NextResponse } from "next/server";

import { callApi, readJson } from "../../../lib/api";
import { unauthenticated } from "../../../lib/bff";
import { readSessionCookie } from "../../../lib/session-cookie";

/** Read-only forward: a GET has no body, so it does not use `proxyJson`. */
export async function GET(request: Request): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }

  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ["limit", "cursor"]) {
    const value = incoming.get(key);
    if (value !== null) {
      query.set(key, value);
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";

  const upstream = await callApi(`/v1/fields${suffix}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const payload = await readJson(upstream);
  return NextResponse.json(payload, { status: upstream.status });
}
