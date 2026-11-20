import { NextResponse } from "next/server";

import { SIGNUP_INTENT_COOKIE, signupIntentCookieOptions } from "../../../../lib/sign-up-intent";

/**
 * Mints the sign-up intent marker (SEC-ABUSE-1, D-222). The sign-up page calls
 * this once on mount; the value is the server's own instant, so the two-second
 * floor is measured against the server clock, never a client-supplied one.
 */
export async function GET(): Promise<NextResponse> {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(
    SIGNUP_INTENT_COOKIE,
    new Date().toISOString(),
    signupIntentCookieOptions(process.env.NODE_ENV === "production"),
  );
  return response;
}
