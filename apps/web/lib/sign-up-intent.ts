import { SIGNUP_INTENT_MAX_AGE_SECONDS, SIGNUP_MIN_SUBMIT_SECONDS } from "@connect/config";

/**
 * The sign-up intent marker (SEC-ABUSE-1, D-222/D-223). The page mints an
 * httpOnly cookie when it mounts; a submission younger than two seconds or older
 * than one hour is refused. The values live in `@connect/config` so a refusal is
 * reproducible in support.
 */
export const SIGNUP_INTENT_COOKIE = "connect_signup_intent";

export interface IntentCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
  secure: boolean;
}

export function signupIntentCookieOptions(secure = false): IntentCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SIGNUP_INTENT_MAX_AGE_SECONDS,
    secure,
  };
}

export type IntentRefusal = "missing" | "too-fast" | "stale" | null;

/**
 * The refusal a marker produces, or null when the submission may proceed. An
 * unparseable or absent marker is `missing`; a submission at exactly two seconds
 * is allowed, as is one at exactly one hour.
 */
export function intentRefusal(input: {
  cookieValue: string | undefined;
  now: number;
  minSeconds?: number;
  maxAgeSeconds?: number;
}): IntentRefusal {
  const minSeconds = input.minSeconds ?? SIGNUP_MIN_SUBMIT_SECONDS;
  const maxAgeSeconds = input.maxAgeSeconds ?? SIGNUP_INTENT_MAX_AGE_SECONDS;
  if (!input.cookieValue) {
    return "missing";
  }
  const issuedAt = Date.parse(input.cookieValue);
  if (Number.isNaN(issuedAt)) {
    return "missing";
  }
  const ageMs = input.now - issuedAt;
  if (ageMs < minSeconds * 1000) {
    return "too-fast";
  }
  if (ageMs > maxAgeSeconds * 1000) {
    return "stale";
  }
  return null;
}

/** A hidden field a person never fills; a non-empty trimmed value is a bot. */
export function honeypotFilled(body: unknown): boolean {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const value = (body as Record<string, unknown>).contact_website;
  return typeof value === "string" && value.trim().length > 0;
}

/** The marker value from a `Cookie` header, or undefined when absent. */
export function intentCookieFrom(cookieHeader: string | null | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SIGNUP_INTENT_COOKIE) {
      const value = rest.join("=").trim();
      return value.length > 0 ? decodeURIComponent(value) : undefined;
    }
  }
  return undefined;
}
