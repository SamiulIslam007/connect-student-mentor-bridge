import { NextResponse, type NextRequest } from "next/server";

import { cspHeader, cspHeaderKey, cspMode } from "./lib/security-headers";

/**
 * One nonce per request (SEC-AUDIT-017, D-261). Next reads the nonce back out of
 * the request's `Content-Security-Policy` header and stamps it onto its own
 * framework and page scripts; the response header is the policy the browser
 * enforces. This file is `proxy.ts` because Next 16 deprecates the `middleware`
 * convention. A deployment that cannot pass the header through must flip
 * `WEB_CSP_MODE=report-only` for one deploy.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const mode = cspMode();
  const policy = cspHeader(mode, nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(cspHeaderKey(mode), policy.value);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(policy.key, policy.value);
  return response;
}

/** Documents only: a static asset has no inline script to authorise. */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
