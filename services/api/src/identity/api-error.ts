import { IdentityError } from "@connect/domain";

/** A failure the caller caused (4xx) rather than an infrastructure fault. */
export function isClientApiError(error: unknown): boolean {
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" && statusCode >= 400 && statusCode < 500;
}

/**
 * Translate a library client error into the project's validation failure
 * (design D3). A 5xx, a database fault, or any unknown error returns null so it
 * still surfaces as a server error instead of being relabelled.
 */
export function asValidationFailure(error: unknown): IdentityError | null {
  return isClientApiError(error)
    ? new IdentityError("VALIDATION_ERROR", "email must be a valid email address")
    : null;
}
