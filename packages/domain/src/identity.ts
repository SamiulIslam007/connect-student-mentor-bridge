/**
 * The identity seam every feature depends on (ADR-003). Implementations live
 * outside this package; no vendor type may appear in these signatures.
 */

export type AccountStatus =
  | "PENDING"
  | "ACTIVE"
  | "SUSPENDED"
  | "DEACTIVATED"
  | "DELETION_PENDING"
  | "ANONYMIZED";

export interface AccountSummary {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  timezone: string;
  accountStatus: AccountStatus;
}

export interface RegisterAccountInput {
  displayName: string;
  email: string;
  password: string;
  /** ISO calendar date (`YYYY-MM-DD`). Checked once and never persisted. */
  dateOfBirth: string;
  timezone?: string;
  requestId: string;
}

export type RegisterAccountResult = {
  status: "VERIFICATION_SENT";
};

export interface SignInInput {
  email: string;
  password: string;
  requestId: string;
}

export interface SignInResult {
  /** Opaque session token; the browser never sees it (httpOnly BFF cookie). */
  sessionToken: string;
  account: AccountSummary;
}

export interface SessionInput {
  sessionToken: string;
  requestId: string;
}

export interface VerifyEmailInput {
  token: string;
  requestId: string;
}

export interface PasswordResetRequestInput {
  email: string;
  requestId: string;
}

export interface PasswordResetInput {
  token: string;
  password: string;
  requestId: string;
}

export interface SessionLookupInput {
  sessionToken: string;
}

export type IdentityErrorCode =
  | "UNDER_MINIMUM_AGE"
  | "INVALID_CREDENTIALS"
  | "INVALID_VERIFICATION_LINK"
  | "INVALID_RESET_TOKEN"
  | "VALIDATION_ERROR"
  | "SESSION_INVALID";

/** A failure a feature module may map to a response, with no library detail. */
export class IdentityError extends Error {
  constructor(
    readonly code: IdentityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "IdentityError";
  }
}

export interface IdentityService {
  register(input: RegisterAccountInput): Promise<RegisterAccountResult>;
  verifyEmail(input: VerifyEmailInput): Promise<void>;
  signIn(input: SignInInput): Promise<SignInResult>;
  signOut(input: SessionInput): Promise<void>;
  signOutEverywhere(input: SessionInput): Promise<void>;
  requestPasswordReset(input: PasswordResetRequestInput): Promise<void>;
  resetPassword(input: PasswordResetInput): Promise<void>;
  getSession(input: SessionLookupInput): Promise<AccountSummary | null>;
}
