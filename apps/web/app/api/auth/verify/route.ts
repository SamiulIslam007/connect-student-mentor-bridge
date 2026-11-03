import { NextResponse } from "next/server";

import { appOrigin, callApi } from "../../../../lib/api";

/**
 * The redirect target is configuration, never a request header. Building it from
 * `Host` or `x-forwarded-proto` would let a caller redirect the browser to an
 * origin it controls (design D7).
 */
function appUrl(path: string): URL {
  return new URL(path, appOrigin());
}

export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(appUrl("/verify?status=invalid"));
  }

  const upstream = await callApi(`/v1/auth/verify?token=${encodeURIComponent(token)}`, {
    method: "GET",
  });

  if (upstream.status === 400) {
    return NextResponse.redirect(appUrl("/verify?status=invalid"));
  }
  if (!upstream.ok) {
    // A server fault is not an expired link; do not tell the user it is.
    return NextResponse.redirect(appUrl("/verify?status=error"));
  }
  return NextResponse.redirect(appUrl("/verify?status=verified"));
}
