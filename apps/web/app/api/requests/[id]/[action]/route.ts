import { NextResponse } from "next/server";

import { forwardUpstream, readJsonBody, unauthenticated } from "../../../../../lib/bff";
import { readSessionCookie } from "../../../../../lib/session-cookie";

const ACTIONS = new Set(["accept", "decline", "withdraw"]);

/** `POST /api/requests/{id}/{accept|decline|withdraw}`. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; action: string }> },
): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const { id, action } = await context.params;
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ code: "NOT_FOUND", title: "Not found" }, { status: 404 });
  }

  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  let body: string | undefined;
  if (action === "decline") {
    const parsed = await readJsonBody(request);
    if (!parsed.ok) {
      return parsed.response;
    }
    headers["content-type"] = "application/json";
    body = JSON.stringify(parsed.value);
  }

  const outcome = await forwardUpstream(
    `/v1/requests/${encodeURIComponent(id)}/${action}`,
    { method: "POST", headers, body },
  );
  if (outcome.kind === "non-json") {
    return outcome.problem;
  }
  return NextResponse.json(outcome.payload, { status: outcome.status });
}
