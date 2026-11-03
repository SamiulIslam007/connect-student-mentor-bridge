/** Password policy (D-04, SEC-AUTH-3): length only, no composition rules. */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export type PasswordPolicyViolation =
  | { code: "TOO_SHORT"; minimumLength: number }
  | { code: "TOO_LONG"; maximumLength: number };

export function passwordPolicyViolation(password: string): PasswordPolicyViolation | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { code: "TOO_SHORT", minimumLength: MIN_PASSWORD_LENGTH };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { code: "TOO_LONG", maximumLength: MAX_PASSWORD_LENGTH };
  }
  return null;
}

/** Display name rule (FR-PROF-01): 1 to 100 characters, any Unicode script. */
export const DISPLAY_NAME_MAX_LENGTH = 100;

export function displayNameViolation(displayName: string): "EMPTY" | "TOO_LONG" | null {
  if (displayName.trim().length === 0) {
    return "EMPTY";
  }
  if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    return "TOO_LONG";
  }
  return null;
}
