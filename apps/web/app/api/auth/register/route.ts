import { NextResponse } from "next/server";

import { proxyJson, readJsonBody, requireJsonContentType } from "../../../../lib/bff";
import {
  consumeIntentNonce,
  honeypotFilled,
  intentCookieFrom,
  intentRefusal,
  SIGNUP_INTENT_COOKIE,
} from "../../../../lib/sign-up-intent";
import { strings } from "../../../../lib/strings";

/**
 * Registration through the BFF (SEC-ABUSE-1, D-221 to D-224). Two checks run
 * before the API is called — the hidden honeypot field and the intent marker —
 * and both answer one generic refusal, so nothing tells a bot which check fired.
 * A valid submission proxies the body it already parsed and clears the marker.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const mediaType = requireJsonContentType(request);
  if (mediaType) {
    return mediaType;
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }

  const marker = intentCookieFrom(request.headers.get("cookie"));
  const secret = process.env.BFF_TRUST_SECRET?.trim() ?? "";
  const check = honeypotFilled(parsed.value)
    ? "honeypot"
    : secret.length === 0
      ? "unsigned"
      : intentRefusal({ cookieValue: marker, now: Date.now(), secret });
  if (check !== null) {
    // The check name stays server-side and carries no personal data (D-224).
    console.info(JSON.stringify({ event: "registration.refused", check }));
    return NextResponse.json(
      {
        type: "https://docs.connect.example/problems/registration-refused",
        title: "Registration refused",
        status: 422,
        code: "REGISTRATION_REFUSED",
        detail: strings.signUp.refused,
      },
      { status: 422 },
    );
  }
  // A signed marker is single-use: a replay of the same nonce is refused (D-261).
  if (!consumeIntentNonce(marker)) {
    console.info(JSON.stringify({ event: "registration.refused", check: "replayed" }));
    return NextResponse.json(
      {
        type: "https://docs.connect.example/problems/registration-refused",
        title: "Registration refused",
        status: 422,
        code: "REGISTRATION_REFUSED",
        detail: strings.signUp.refused,
      },
      { status: 422 },
    );
  }

  const response = await proxyJson("/v1/auth/register", request, { body: parsed.value });
  if (response.status >= 200 && response.status < 300) {
    response.cookies.set(SIGNUP_INTENT_COOKIE, "", { path: "/", maxAge: 0 });
  }
  return response;
}
