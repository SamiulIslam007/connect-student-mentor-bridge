import { NextResponse } from "next/server";

import { proxyJson, requireJsonContentType } from "../../../../lib/bff";

export async function POST(request: Request): Promise<NextResponse> {
  const mediaType = requireJsonContentType(request);
  if (mediaType) {
    return mediaType;
  }

  return proxyJson("/v1/auth/forgot-password", request);
}
