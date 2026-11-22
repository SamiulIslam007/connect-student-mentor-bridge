import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { SIGNUP_INTENT_MAX_AGE_SECONDS, SIGNUP_MIN_SUBMIT_SECONDS } from "@connect/config";

/**
 * The sign-up intent marker (SEC-ABUSE-1, D-222/D-223, D-261). The page mints an
 * httpOnly cookie when it mounts; a submission younger than two seconds or older
 * than one hour is refused. The value is signed with the server's BFF secret and
 * carries a nonce, so it cannot be forged and is accepted once.
 */
export const SIGNUP_INTENT_COOKIE = "connect_signup_intent";

/** How many consumed nonces the process remembers (a single web instance in the pilot). */
const MAX_CONSUMED = 2_000;
const consumedNonces = new Set<string>();

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

export type IntentRefusal = "missing" | "too-fast" | "stale" | "forged" | "replayed" | null;

function signatureOf(issuedAt: string, nonce: string, secret: string): string {
  return createHmac("sha256", secret).update(`${issuedAt}.${nonce}`).digest("base64url");
}

/** `issuedAtMillis.nonce.signature`, all three server-generated. */
export function signIntent(input: {
  issuedAt: Date;
  secret: string;
  nonce?: string;
}): string {
  const issuedAt = String(input.issuedAt.getTime());
  const nonce = input.nonce ?? randomBytes(16).toString("base64url");
  return `${issuedAt}.${nonce}.${signatureOf(issuedAt, nonce, input.secret)}`;
}

/** Constant-time, and a length difference is not a secret. */
function signatureMatches(expected: string, offered: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(offered);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The refusal a marker produces, or null when the submission may proceed. The
 * signature is checked before the clock, so a forged value never looks merely
 * "too fast". An unparseable or absent marker is `missing`; a submission at
 * exactly two seconds is allowed, as is one at exactly one hour.
 */
export function intentRefusal(input: {
  cookieValue: string | undefined;
  now: number;
  secret?: string;
  minSeconds?: number;
  maxAgeSeconds?: number;
}): IntentRefusal {
  const minSeconds = input.minSeconds ?? SIGNUP_MIN_SUBMIT_SECONDS;
  const maxAgeSeconds = input.maxAgeSeconds ?? SIGNUP_INTENT_MAX_AGE_SECONDS;
  if (!input.cookieValue) {
    return "missing";
  }
  const parts = input.cookieValue.split(".");
  if (parts.length !== 3) {
    // A legacy unsigned value is a forged value now that signing is required.
    return input.secret === undefined ? timeRefusal(input.cookieValue, input.now, minSeconds, maxAgeSeconds) : "forged";
  }
  const [issuedAt, nonce, signature] = parts;
  if (input.secret !== undefined) {
    if (!nonce || !signatureMatches(signatureOf(issuedAt, nonce, input.secret), signature)) {
      return "forged";
    }
  }
  const timed = timeRefusal(issuedAt, input.now, minSeconds, maxAgeSeconds);
  if (timed !== null) {
    return timed;
  }
  if (input.secret !== undefined && consumedNonces.has(nonce)) {
    return "replayed";
  }
  return null;
}

/** Records the nonce; `false` means another submission already used it. */
export function consumeIntentNonce(cookieValue: string | undefined): boolean {
  if (!cookieValue) {
    return false;
  }
  const nonce = cookieValue.split(".")[1];
  if (!nonce) {
    return false;
  }
  if (consumedNonces.has(nonce)) {
    return false;
  }
  if (consumedNonces.size >= MAX_CONSUMED) {
    consumedNonces.clear();
  }
  consumedNonces.add(nonce);
  return true;
}

function timeRefusal(
  issuedAtValue: string,
  now: number,
  minSeconds: number,
  maxAgeSeconds: number,
): IntentRefusal {
  // A signed marker carries epoch milliseconds; a legacy value is an ISO string.
  const issuedAt = /^\d+$/.test(issuedAtValue) ? Number(issuedAtValue) : Date.parse(issuedAtValue);
  if (Number.isNaN(issuedAt)) {
    return "missing";
  }
  const ageMs = now - issuedAt;
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
