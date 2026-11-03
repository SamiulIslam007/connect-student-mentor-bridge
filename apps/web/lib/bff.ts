import { NextResponse } from "next/server";

import { callApi, readJson } from "./api";

/**
 * The browser talks only to these route handlers. They forward to the API and
 * never return upstream detail beyond the problem body.
 */
export async function proxyJson(
  path: string,
  request: Request,
  options: { sessionToken?: string; method?: string } = {},
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "VALIDATION_FAILED", title: "Request validation failed" }, { status: 422 });
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.sessionToken) {
    headers.authorization = `Bearer ${options.sessionToken}`;
  }

  const upstream = await callApi(path, {
    method: options.method ?? "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await readJson(upstream);
  return NextResponse.json(payload, { status: upstream.status });
}

export function unauthenticated(): NextResponse {
  return NextResponse.json({ code: "UNAUTHENTICATED", title: "Authentication failed" }, { status: 401 });
}
