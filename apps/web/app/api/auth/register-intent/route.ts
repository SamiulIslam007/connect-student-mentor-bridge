import { NextResponse } from "next/server";

import {
  SIGNUP_INTENT_COOKIE,
  signIntent,
  signupIntentCookieOptions,
} from "../../../../lib/sign-up-intent";

/**
 * Mints the sign-up intent marker (SEC-ABUSE-1, D-222; signed by D-261). The
 * sign-up page calls this once on mount; the value is the server's own instant
 * plus a nonce, signed with the BFF secret, so the two-second floor is measured
 * against the server clock and the value cannot be forged.
 */
export async function GET(): Promise<NextResponse> {
  const secret = process.env.BFF_TRUST_SECRET?.trim() ?? "";
  if (secret.length === 0) {
    // Without the secret a marker would be forgeable, so no marker is issued.
    console.error(
      JSON.stringify({
        event: "web.signup_intent_unavailable",
        reason: "BFF_TRUST_SECRET is not set",
      }),
    );
    return NextResponse.json(
      { code: "SIGNUP_UNAVAILABLE", title: "Sign-up is temporarily unavailable" },
      { status: 503 },
    );
  }
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(
    SIGNUP_INTENT_COOKIE,
    signIntent({ issuedAt: new Date(), secret }),
    signupIntentCookieOptions(process.env.NODE_ENV === "production"),
  );
  return response;
}
