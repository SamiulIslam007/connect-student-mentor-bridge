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
