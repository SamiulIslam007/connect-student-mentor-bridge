import { NextResponse } from "next/server";

import { callApi } from "../../../../lib/api";

/**
 * Build the browser-facing URL from the request's own Host header. `request.url`
 * carries the server bind address (0.0.0.0 inside Compose), which a browser
 * cannot follow.
 */
function appUrl(request: Request, path: string): URL {
  const host = request.headers.get("host") ?? "localhost:3000";
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";
  return new URL(path, `${protocol}://${host}`);
}

export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(appUrl(request, "/verify?status=invalid"));
  }

  const upstream = await callApi(`/v1/auth/verify?token=${encodeURIComponent(token)}`, {
    method: "GET",
  });

  return NextResponse.redirect(
    appUrl(request, upstream.ok ? "/verify?status=verified" : "/verify?status=invalid"),
  );
}
