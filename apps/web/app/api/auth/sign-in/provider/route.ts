import { NextResponse } from "next/server";

import { appOrigin } from "../../../../../lib/api";
import { forwardUpstream, readJsonBody } from "../../../../../lib/bff";
import { OAUTH_STATE_COOKIE_NAME, mfaCookieOptions } from "../../../../../lib/mfa-cookie";

/**
 * `POST /api/auth/sign-in/provider` — asks the API for the Google authorization
 * URL, keeps the opaque state in a cookie, and hands the URL to the page.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }

  const requested =
    typeof parsed.value === "object" && parsed.value !== null
      ? (parsed.value as Record<string, unknown>)
      : {};

  const outcome = await forwardUpstream("/v1/auth/sign-in/provider", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: typeof requested.provider === "string" ? requested.provider : "google",
      callback_url: `${appOrigin()}/account`,
    }),
  });
  if (outcome.kind === "non-json") {
    return outcome.problem;
  }
  if (outcome.status < 200 || outcome.status >= 300) {
    return NextResponse.json(outcome.payload, { status: outcome.status });
  }

  const authorizationUrl = outcome.payload.authorization_url;
  const stateCookie = outcome.payload.state_cookie;
  if (typeof authorizationUrl !== "string" || typeof stateCookie !== "string") {
    return NextResponse.json({ code: "INTERNAL_ERROR" }, { status: 500 });
  }

  const response = NextResponse.json({ authorization_url: authorizationUrl });
  response.cookies.set(OAUTH_STATE_COOKIE_NAME, stateCookie, mfaCookieOptions());
  return response;
}
