/**
 * The second-factor challenge lives in its own short-lived cookie, never in a
 * page, `localStorage`, or a response body (design D2). It is opaque: the value
 * is the library's signed challenge, so the BFF can only replay it, not read it.
 */
export const MFA_COOKIE_NAME = "connect_mfa";
export const OAUTH_STATE_COOKIE_NAME = "connect_oauth_state";

/** Ten minutes, matching the API's challenge and state lifetimes. */
export const FLOW_COOKIE_MAX_AGE_SECONDS = 600;

export interface MfaCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
}

export function mfaCookieOptions(
  production: boolean = process.env.NODE_ENV === "production",
): MfaCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: production,
    path: "/",
    maxAge: FLOW_COOKIE_MAX_AGE_SECONDS,
  };
}

function readCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const [cookieName, ...rest] = part.trim().split("=");
    if (cookieName === name && rest.length > 0) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** The challenge, or null when the browser has none or it is malformed. */
export function readMfaCookie(cookieHeader: string | null): string | null {
  return readCookieValue(cookieHeader, MFA_COOKIE_NAME);
}

/** The provider state this API issued, or null. */
export function readOauthStateCookie(cookieHeader: string | null): string | null {
  return readCookieValue(cookieHeader, OAUTH_STATE_COOKIE_NAME);
}
