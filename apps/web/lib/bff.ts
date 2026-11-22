import { NextResponse } from "next/server";

import { callApi } from "./api";
import { signedClientHeaders } from "./client-key";

/** The one header the API's idempotency interceptor reads. */
export const IDEMPOTENCY_HEADER_NAME = "idempotency-key";

/**
 * The shape the API accepts (8 to 128 letters, digits, dot, underscore or
 * hyphen). Copied rather than imported: `@connect/domain`'s `.js` source
 * specifiers do not resolve in the Next build, so a web module cannot import it.
 */
function idempotencyKeyInvalid(key: string): boolean {
  return key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._-]+$/.test(key);
}

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
 * The five pre-session writes are CSRF-exempt, so a cross-site `fetch` with
 * `Content-Type: text/plain` would otherwise be a simple request that carries
 * valid JSON (SEC-AUDIT-004). Requiring JSON forces a preflight the BFF never
 * answers. Runs before the body is read.
 */
export function requireJsonContentType(request: Request): NextResponse | null {
  const declared = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (declared === "application/json" || (declared.startsWith("application/") && declared.endsWith("+json"))) {
    return null;
  }
  return NextResponse.json(
    {
      type: "https://docs.connect.example/problems/unsupported-media-type",
      title: "The request body must be JSON",
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
    },
    { status: 415 },
  );
}

/**
 * The BFF builds every upstream header itself. Inbound forwarding headers are
 * never copied, so a client cannot choose the API's bucket or the bearer token.
 * An `Idempotency-Key` is the one caller header that is forwarded, and only when
 * it is a well-formed key the API would accept (SEC-AUDIT-015).
 */
export function upstreamHeaders(request: Request, sessionToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...signedClientHeaders(request),
  };
  if (sessionToken) {
    headers.authorization = `Bearer ${sessionToken}`;
  }
  const idempotencyKey = request.headers.get(IDEMPOTENCY_HEADER_NAME);
  if (idempotencyKey !== null && !idempotencyKeyInvalid(idempotencyKey)) {
    headers[IDEMPOTENCY_HEADER_NAME] = idempotencyKey;
  }
  return headers;
}

/**
 * The browser talks only to these route handlers. They forward to the API and
 * never return upstream detail beyond the problem body.
 */
export async function proxyJson(
  path: string,
  request: Request,
  options: { sessionToken?: string; method?: string; body?: unknown } = {},
): Promise<NextResponse> {
  // A route that already read and checked the body hands it in (design R7 of
  // `signup-bot-protection`): the stream cannot be read twice, and cloning it
  // would double the buffer on the one route an attacker can drive at will.
  const parsed =
    options.body === undefined ? await readJsonBody(request) : { ok: true as const, value: options.body };
  if (!parsed.ok) {
    return parsed.response;
  }

  const headers = upstreamHeaders(request, options.sessionToken);

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
