import { IdentityError } from "@connect/domain";

/**
 * The API's own body bound. The BFF caps at 128 KiB, so the API's 100 KiB is
 * the field-level refusal a direct caller sees (design D8 of the hardening
 * change).
 */
export const API_MAX_BODY_BYTES = 100 * 1024;

/**
 * Refuses any top-level body key the route's contract does not document.
 * `undefined` is an absent body (allowed); any other non-object is refused.
 * The message names the first offending key in sorted order, so a test can
 * assert it deterministically (design D4).
 */
export function bodyKeys(body: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (body === undefined || body === null) {
    return {};
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new IdentityError("VALIDATION_ERROR", "the request body must be a JSON object");
  }
  const record = body as Record<string, unknown>;
  const unknown = Object.keys(record)
    .filter((key) => !allowed.includes(key))
    .sort();
  if (unknown.length > 0) {
    throw new IdentityError("VALIDATION_ERROR", `unknown property: ${unknown[0]}`);
  }
  return record;
}
