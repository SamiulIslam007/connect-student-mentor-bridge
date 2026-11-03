import { IdentityError } from "@connect/domain";

/** A failure the caller caused (4xx) rather than an infrastructure fault. */
export function isClientApiError(error: unknown): boolean {
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" && statusCode >= 400 && statusCode < 500;
}

/** The statuses and body codes the library uses for an invalid input. */
const VALIDATION_STATUSES = new Set([400, 422]);
const VALIDATION_CODES = new Set(["VALIDATION_ERROR", "INVALID_EMAIL"]);

/**
 * Translate a library input error into the project's validation failure
 * (design D3). Only an input error is mapped: a 5xx, a 401/403 (handled by the
 * caller), a 429, or an unknown error returns null so it still surfaces as a
 * server error instead of being relabelled as a bad email address.
 */
export function asValidationFailure(error: unknown): IdentityError | null {
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  const code = (error as { body?: { code?: unknown } }).body?.code;
  const isInputError =
    (typeof statusCode === "number" && VALIDATION_STATUSES.has(statusCode)) ||
    (typeof code === "string" && VALIDATION_CODES.has(code));
  return isInputError
    ? new IdentityError("VALIDATION_ERROR", "email must be a valid email address")
    : null;
}
