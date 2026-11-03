import { NextResponse } from "next/server";

import { proxyJson } from "../../../../lib/bff";

export async function POST(request: Request): Promise<NextResponse> {
  return proxyJson("/v1/auth/reset-password", request);
}
