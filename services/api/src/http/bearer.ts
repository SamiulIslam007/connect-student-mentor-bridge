import { IdentityError } from "@connect/domain";

import type { RequestWithId } from "./request-id.middleware.js";

/** The opaque session token the BFF sends. Never logged, never returned. */
export function bearerToken(request: RequestWithId): string {
  const header = request.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/.exec(header);
  if (!match || match[1].trim().length === 0) {
    throw new IdentityError("SESSION_INVALID", "a bearer session token is required");
  }
  return match[1].trim();
}

/**
 * The same token, or `undefined` when the request carries none. Used where a
 * session is optional: second-factor verification accepts either a session or a
 * sign-in challenge (design D2).
 */
export function optionalBearerToken(request: RequestWithId): string | undefined {
  const header = request.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/.exec(header);
  return match && match[1].trim().length > 0 ? match[1].trim() : undefined;
}
