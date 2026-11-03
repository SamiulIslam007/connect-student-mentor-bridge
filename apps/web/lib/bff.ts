import { NextResponse } from "next/server";

import { callApi } from "./api";

/**
 * The BFF caps the body before it parses it (design D8). It is larger than the
 * API's own 100 KiB limit, so the API still owns the field-level rules; this cap
 * only stops an unbounded read. `NEXT_BODY_SIZE_LIMIT` and the general 10 MB
 * body-clone limit do not reject a request.
 */
export const BFF_MAX_BODY_BYTES = 128 * 1024;

export type BodyResult =
  | { ok: true; value: unknown }
  | { ok: false; response: NextResponse };

function payloadTooLarge(): NextResponse {
  return NextResponse.json(
    {
      type: "https://docs.connect.example/problems/payload-too-large",
      title: "Request body is too large",
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    },
    { status: 413 },
  );
}

function validationFailed(): NextResponse {
  return NextResponse.json(
    { code: "VALIDATION_FAILED", title: "Request validation failed" },
    { status: 422 },
  );
}

function invalidRequestBody(): NextResponse {
  return NextResponse.json(
    {
      type: "https://docs.connect.example/problems/invalid-request-body",
      title: "The request body could not be read",
      status: 400,
      code: "INVALID_REQUEST_BODY",
    },
    { status: 400 },
  );
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Read and parse a JSON body, rejecting anything over `BFF_MAX_BODY_BYTES`.
 * A declared `Content-Length` is checked first; otherwise (a chunked body) the
 * stream is counted and reading stops at the cap.
 */
export async function readJsonBody(request: Request): Promise<BodyResult> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > BFF_MAX_BODY_BYTES) {
    return { ok: false, response: payloadTooLarge() };
  }

  if (!request.body) {
    return { ok: false, response: validationFailed() };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        total += value.byteLength;
        if (total > BFF_MAX_BODY_BYTES) {
          await reader.cancel();
          return { ok: false, response: payloadTooLarge() };
        }
        chunks.push(value);
      }
    } catch (error) {
      // A client abort or an already-consumed stream must not become an
      // unlogged 500 out of the route handler.
      console.error(
        JSON.stringify({
          event: "web.body_read_failed",
          message: error instanceof Error ? error.message : "unknown error",
        }),
      );
      return { ok: false, response: invalidRequestBody() };
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(concat(chunks, total))) as unknown };
  } catch {
    return { ok: false, response: validationFailed() };
  }
}

export type UpstreamOutcome =
  | { kind: "json"; status: number; payload: Record<string, unknown> }
  | { kind: "non-json"; status: number; problem: NextResponse };

/**
 * Forward to the API and insist on a JSON answer. A non-JSON body (an HTML error
 * page from a proxy, for example) becomes a `502` problem instead of `{}` or a
 * misleading success; the upstream status stays in the log (design D8).
 */
export async function forwardUpstream(path: string, init: RequestInit): Promise<UpstreamOutcome> {
  const upstream = await callApi(path, init);
  const text = await upstream.text();

  if (!text) {
    if (upstream.status >= 200 && upstream.status < 300) {
      // Every contract endpoint returns JSON; a silent empty success would be
      // reported to the page as a successful save.
      console.error(
        JSON.stringify({ event: "web.upstream_empty_body", path, status: upstream.status }),
      );
      return nonJsonProblem(upstream.status);
    }
    return { kind: "json", status: upstream.status, payload: {} };
  }

  try {
    return { kind: "json", status: upstream.status, payload: JSON.parse(text) as Record<string, unknown> };
  } catch {
    console.error(
      JSON.stringify({ event: "web.upstream_non_json", path, status: upstream.status }),
    );
    return nonJsonProblem(upstream.status);
  }
}

function nonJsonProblem(status: number): UpstreamOutcome {
  return {
    kind: "non-json",
    status,
    problem: NextResponse.json(
      {
        type: "https://docs.connect.example/problems/internal-error",
        title: "The API returned an unexpected response",
        status: 502,
        code: "INTERNAL_ERROR",
      },
      { status: 502 },
    ),
  };
}

/**
 * The browser talks only to these route handlers. They forward to the API and
 * never return upstream detail beyond the problem body.
 */
export async function proxyJson(
  path: string,
  request: Request,
  options: { sessionToken?: string; method?: string } = {},
): Promise<NextResponse> {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.sessionToken) {
    headers.authorization = `Bearer ${options.sessionToken}`;
  }

  const outcome = await forwardUpstream(path, {
    method: options.method ?? "POST",
    headers,
    body: JSON.stringify(parsed.value),
  });
  if (outcome.kind === "non-json") {
    return outcome.problem;
  }
  return NextResponse.json(outcome.payload, { status: outcome.status });
}

export function unauthenticated(): NextResponse {
  return NextResponse.json({ code: "UNAUTHENTICATED", title: "Authentication failed" }, { status: 401 });
}
