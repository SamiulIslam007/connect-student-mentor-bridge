import { strings } from "./strings";

/** A failed fetch has no HTTP status; the page passes this sentinel. */
export const NETWORK_ERROR_STATUS = 0;

/**
 * One place that decides which sign-up message a failure gets, so the age gate,
 * a field validation error, a lost connection, and an unexpected failure stay
 * distinguishable (FR-AUTH-03, design D10).
 */
export function signUpErrorMessage(status: number, code: string | undefined): string {
  if (status === NETWORK_ERROR_STATUS) {
    return strings.signUp.network;
  }
  if (status === 422 && code === "UNDER_MINIMUM_AGE") {
    return strings.signUp.underAge;
  }
  if (status === 422 && code === "VALIDATION_FAILED") {
    return strings.signUp.invalid;
  }
  return strings.signUp.error;
}
