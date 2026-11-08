import { NextResponse } from "next/server";

import { forwardUpstream, proxyJson, unauthenticated } from "../../../../lib/bff";
import { readSessionCookie } from "../../../../lib/session-cookie";

/**
 * `GET|POST|PUT /api/mentorships[/{id}[/...]]`. One handler for the whole
 * mentorship surface keeps the forwarded paths in one allow-list; anything not
 * listed here is a local 404 and never reaches the API.
 */
const ALLOWED = new Set([
  "GET /",
  "GET /:id",
  "GET /:id/messages",
  "POST /:id/messages",
  "POST /:id/sessions",
  "POST /:id/complete",
  "PUT /:id/agreement",
  "POST /:id/agreement/acknowledge",
]);

const SEGMENT = /^[A-Za-z0-9-]+$/;

function patternOf(segments: string[]): string {
  if (segments.length === 0) {
    return "/";
  }
  return `/${[":id", ...segments.slice(1)].join("/")}`;
}

type PathContext = { params: Promise<{ path?: string[] }> };

export async function GET(request: Request, context: PathContext): Promise<NextResponse> {
  return await forward(request, context, "GET");
}

export async function POST(request: Request, context: PathContext): Promise<NextResponse> {
  return await forward(request, context, "POST");
}

export async function PUT(request: Request, context: PathContext): Promise<NextResponse> {
  return await forward(request, context, "PUT");
}

async function forward(
  request: Request,
  context: PathContext,
  method: "GET" | "POST" | "PUT",
): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const segments = (await context.params).path ?? [];
  if (
    segments.some((segment) => !SEGMENT.test(segment)) ||
    !ALLOWED.has(`${method} ${patternOf(segments)}`)
  ) {
    return NextResponse.json({ code: "NOT_FOUND", title: "Not found" }, { status: 404 });
  }

  const path = `/v1/mentorships${segments.length > 0 ? `/${segments.map(encodeURIComponent).join("/")}` : ""}`;
  if (method === "GET") {
    const outcome = await forwardUpstream(`${path}${new URL(request.url).search}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (outcome.kind === "non-json") {
      return outcome.problem;
    }
    return NextResponse.json(outcome.payload, { status: outcome.status });
  }
  return await proxyJson(path, request, { sessionToken: token, method });
}
