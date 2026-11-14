import { NextResponse } from "next/server";

import { callApi } from "../../../../../lib/api";
import { unauthenticated } from "../../../../../lib/bff";
import { readSessionCookie } from "../../../../../lib/session-cookie";
import { requireCsrf } from "../../../../../lib/csrf";

/**
 * `DELETE /api/me/sessions/{id}` — a `204` carries no body, so this route reads
 * the upstream response directly instead of through `forwardUpstream` (which
 * treats an empty success body as a failure). The session cookie is left alone:
 * revoking the caller's own session makes the next request `401`, which every
 * page already handles.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const refused = requireCsrf(request);
  if (refused) {
    return refused;
  }


  const { id } = await context.params;
  const upstream = await callApi(`/v1/me/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });

  if (upstream.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const text = await upstream.text();
  if (!text) {
    return NextResponse.json({ code: "INTERNAL_ERROR" }, { status: 502 });
  }
  try {
    return NextResponse.json(JSON.parse(text) as Record<string, unknown>, { status: upstream.status });
  } catch {
    return NextResponse.json({ code: "INTERNAL_ERROR" }, { status: 502 });
  }
}
