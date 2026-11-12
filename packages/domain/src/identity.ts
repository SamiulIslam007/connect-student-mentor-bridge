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

/** Canonical roles (docs/data-model.md §4.1), in declaration order. */
export const ROLES = [
  "STUDENT",
  "MENTOR",
  "INSTITUTION_ADMIN",
  "PLATFORM_ADMIN",
  "EMPLOYER",
] as const;

export type Role = (typeof ROLES)[number];

/** FR-AUTH-04: the roles that may act on other people's data need a factor. */
export function requiresMfa(role: Role): boolean {
  return role === "MENTOR" || role === "INSTITUTION_ADMIN" || role === "PLATFORM_ADMIN";
}

export interface AccountSummary {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  timezone: string;
  accountStatus: AccountStatus;
  /** True when a verified second factor is active (D-48, `mfa_enrollment_ui`). */
  mfaEnabled: boolean;
}

export interface RegisterAccountInput {
  displayName: string;
  email: string;
  password: string;
  /** ISO calendar date (`YYYY-MM-DD`). Checked once and never persisted. */
  dateOfBirth: string;
  /** Explicit acceptance of the terms and privacy notice (D-82). */
  consentAccepted: boolean;
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

/**
 * A password sign-in either issues a session or stops at the second factor.
 * `mfaChallenge` is an opaque value the caller returns with the verification
 * code; it carries no token and expires with the library's own challenge.
 */
export type SignInResult =
  | { mfaRequired: false; sessionToken: string; account: AccountSummary }
  | { mfaRequired: true; mfaChallenge: string };

export interface SessionInput {
  sessionToken: string;
  requestId: string;
}

export interface EnrollMfaInput {
  sessionToken: string;
  /** The library re-checks the account password before creating a secret. */
  password: string;
  requestId: string;
}

export interface MfaEnrollment {
  /** `otpauth://` URI for an authenticator application; shown once. */
  totpUri: string;
  /** Single-use recovery codes; shown once. */
  backupCodes: string[];
}

export interface VerifyMfaInput {
  code: string;
  /** Present when verifying a sign-in challenge (no session yet). */
  mfaChallenge?: string;
  /** Present when confirming an enrollment for the signed-in account. */
  sessionToken?: string;
  /** `totp` (default) or `backup_code`. */
  method?: "totp" | "backup_code";
  requestId: string;
}

export interface VerifyMfaResult {
  sessionToken: string;
  account: AccountSummary;
}

export interface DisableMfaInput {
  sessionToken: string;
  password: string;
  requestId: string;
}

export interface DisableMfaResult {
  /** The library rotates the session when the factor is removed. */
  sessionToken: string;
}

export interface SessionSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  /** True for the session that made this request. */
  current: boolean;
}

export interface ListSessionsInput {
  sessionToken: string;
}

export interface RevokeSessionInput {
  sessionToken: string;
  sessionId: string;
  requestId: string;
}

export interface ProviderSignInStartInput {
  provider: string;
  /** Where the provider sends the browser back to. */
  callbackUrl: string;
  requestId: string;
}

export interface ProviderSignInStart {
  authorizationUrl: string;
  /** Opaque: the state cookie the callback must return unaltered. */
  stateCookie: string;
}

export interface ProviderSignInCallbackInput {
  provider: string;
  code: string;
  /** The provider's `state` query parameter. */
  state: string;
  /** The opaque `state` value from the start response. */
  stateCookie: string;
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

export interface ActivateAccountInput {
  userId: string;
  requestId: string;
}

export interface SuspendAccountInput {
  userId: string;
  /** Free text with no PII; FR-ADM-05 owns the vocabulary. */
  reason: string;
  /** ISO calendar date (`YYYY-MM-DD`): stored, shown, and audited, never enforced (D-88). */
  suspendedUntil?: string;
  actorUserId: string;
  requestId: string;
}

export interface DeactivateAccountInput {
  /** Self-service: the account id comes from the session, never a body. */
  sessionToken: string;
  requestId: string;
}

export type IdentityErrorCode =
  | "UNDER_MINIMUM_AGE"
  | "INVALID_CREDENTIALS"
  | "INVALID_VERIFICATION_LINK"
  | "INVALID_RESET_TOKEN"
  | "VALIDATION_ERROR"
  | "SESSION_INVALID"
  | "EMAIL_NOT_VERIFIED"
  | "ACCOUNT_SUSPENDED"
  | "FORBIDDEN"
  | "ROLE_REQUIRED"
  | "MFA_REQUIRED"
  | "PROVIDER_UNAVAILABLE"
  | "SESSION_NOT_FOUND"
  | "AFFILIATION_EMAIL_UNVERIFIED"
  | "AFFILIATION_INSTITUTION_MISMATCH"
  | "MENTOR_NOT_VERIFIED"
  | "MENTOR_UNAVAILABLE"
  | "MENTOR_AT_CAPACITY"
  | "DUPLICATE_PENDING_REQUEST"
  | "REQUEST_LIMIT_REACHED"
  | "REQUEST_INVALID_STATE"
  | "MENTORSHIP_INVALID_STATE"
  | "CAPACITY_BELOW_ACTIVE"
  | "OUTCOME_INVALID_STATE"
  | "REPORT_ALREADY_RESOLVED"
  /** A signed-in student asked for a student-only read without a profile. */
  | "STUDENT_PROFILE_REQUIRED"
  /** A claim was already decided by another reviewer (or by itself). */
  | "CLAIM_ALREADY_DECIDED"
  /** A domain is already registered to an institution (any letter case). */
  | "INSTITUTION_DOMAIN_TAKEN";

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

export interface GrantRoleInput {
  /** The caller's own account id; a body can never name another account. */
  userId: string;
  role: Role;
  /** Required by `role_assignments_institution_required` for INSTITUTION_ADMIN. */
  institutionId?: string;
  actorUserId?: string;
  requestId: string;
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
  /** Idempotent: applies only to a `PENDING` account (design D1). */
  activateAccount(input: ActivateAccountInput): Promise<AccountSummary>;
  suspendAccount(input: SuspendAccountInput): Promise<AccountSummary>;
  deactivateAccount(input: DeactivateAccountInput): Promise<void>;
  /** Sprint 2 (`access-google-mfa-and-sessions`): second factor and sessions. */
  enrollMfa(input: EnrollMfaInput): Promise<MfaEnrollment>;
  verifyMfa(input: VerifyMfaInput): Promise<VerifyMfaResult>;
  disableMfa(input: DisableMfaInput): Promise<DisableMfaResult>;
  listSessions(input: ListSessionsInput): Promise<SessionSummary[]>;
  revokeSession(input: RevokeSessionInput): Promise<void>;
  /** Active roles for one account, in declaration order (design D4). */
  listRoles(userId: string): Promise<Role[]>;
  /** Idempotent; one `ROLE_GRANTED` audit entry on an actual grant only. */
  grantRole(input: GrantRoleInput): Promise<Role[]>;
  /** The institution ids of the account's active INSTITUTION_ADMIN rows. */
  listInstitutionAdminScopes(userId: string): Promise<string[]>;
  startProviderSignIn(input: ProviderSignInStartInput): Promise<ProviderSignInStart>;
  completeProviderSignIn(input: ProviderSignInCallbackInput): Promise<SignInResult>;
}
