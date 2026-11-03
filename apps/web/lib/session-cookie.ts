export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
}

/** The browser only ever holds this opaque token, never an access token. */
export const SESSION_COOKIE_NAME = "connect_session";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** httpOnly and SameSite=Lax always; Secure outside development (design D11). */
export function sessionCookieOptions(
  production: boolean = process.env.NODE_ENV === "production",
): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: production,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function readSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE_NAME && rest.length > 0) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}
