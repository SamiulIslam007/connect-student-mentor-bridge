import { NextResponse } from "next/server";

import { forwardUpstream, proxyJson, unauthenticated } from "../../../../lib/bff";
import { readSessionCookie } from "../../../../lib/session-cookie";

/**
 * `POST /api/sessions/{id}/{confirm-held|cancel}`. One handler, one allow-list;
 * the browser never builds an API path itself.
 */
const ALLOWED = new Set(["POST /:id/confirm-held", "POST /:id/cancel"]);

const SEGMENT = /^[A-Za-z0-9-]+$/;

type PathContext = { params: Promise<{ path?: string[] }> };

export async function POST(request: Request, context: PathContext): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const segments = (await context.params).path ?? [];
  const pattern =
    segments.length === 0 ? "/" : `/${[":id", ...segments.slice(1)].join("/")}`;
  if (
    segments.some((segment) => !SEGMENT.test(segment)) ||
    !ALLOWED.has(`POST ${pattern}`)
  ) {
    return NextResponse.json({ code: "NOT_FOUND", title: "Not found" }, { status: 404 });
  }

  const path = `/v1/sessions/${segments.map(encodeURIComponent).join("/")}`;
  if (pattern.endsWith("/confirm-held")) {
    // A confirmation carries no body, so it is forwarded without a parse step.
    const outcome = await forwardUpstream(path, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    if (outcome.kind === "non-json") {
      return outcome.problem;
    }
    return NextResponse.json(outcome.payload, { status: outcome.status });
  }
  return await proxyJson(path, request, { sessionToken: token, method: "POST" });
}
