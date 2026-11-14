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

/** Read one cookie by name from a `Cookie` header. */
export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const [cookieName, ...rest] = part.trim().split("=");
    if (cookieName === name && rest.length > 0) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        // A malformed cookie is not a credential: treat it as absent (design D8)
        // instead of throwing a 500 out of the route handler.
        return null;
      }
    }
  }
  return null;
}

export function readSessionCookie(cookieHeader: string | null): string | null {
  return readCookie(cookieHeader, SESSION_COOKIE_NAME);
}
