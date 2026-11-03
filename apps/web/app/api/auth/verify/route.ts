import { NextResponse } from "next/server";

import { callApi } from "../../../../lib/api";

export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/verify?status=invalid", request.url));
  }

  const upstream = await callApi(`/v1/auth/verify?token=${encodeURIComponent(token)}`, {
    method: "GET",
  });

  return NextResponse.redirect(
    new URL(upstream.ok ? "/verify?status=verified" : "/verify?status=invalid", request.url),
  );
}
