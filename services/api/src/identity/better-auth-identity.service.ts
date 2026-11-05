import { createHmac } from "node:crypto";

import { and, desc, eq, gt } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import {
  AGE_GATE_VERSION,
  displayNameViolation,
  IdentityError,
  isAtLeast18,
  isCalendarDate,
  passwordPolicyViolation,
  type AccountStatus,
  type AccountSummary,
  type ActivateAccountInput,
  type DeactivateAccountInput,
  type DisableMfaInput,
  type DisableMfaResult,
  type EnrollMfaInput,
  type IdentityErrorCode,
  type IdentityService,
  type ListSessionsInput,
  type MfaEnrollment,
  type PasswordResetInput,
  type PasswordResetRequestInput,
  type ProviderSignInCallbackInput,
  type ProviderSignInStart,
  type ProviderSignInStartInput,
  type RegisterAccountInput,
  type RegisterAccountResult,
  type RevokeSessionInput,
  type SessionInput,
  type SessionLookupInput,
  type SessionSummary,
  type SignInInput,
  type SignInResult,
  type SuspendAccountInput,
  type VerifyEmailInput,
  type VerifyMfaInput,
  type VerifyMfaResult,
} from "@connect/domain";

import type { Database } from "../db/database.js";
import { auditLogs, consentRecords, sessions, signupBlocks, users } from "../db/schema/index.js";
import { asValidationFailure, isClientApiError } from "./api-error.js";
import { activatePendingAccount } from "./account-activation.js";
import type { IdentityAuth } from "./better-auth.js";
import { appendAuditEntry, type AuditEntry } from "./audit-log.js";
import { runWithRequestId } from "./request-context.js";

/** Version of the terms and privacy notice shown at registration (Proposed). */
export const CONSENT_DOCUMENT_VERSION = "2026-11";

/** Twelve months, the Proposed default in `docs/data-model.md`. */
const SIGNUP_BLOCK_DURATION_MS = 365 * 24 * 60 * 60 * 1000;

const ACCOUNT_STATUSES: readonly AccountStatus[] = [
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "DEACTIVATED",
  "DELETION_PENDING",
  "ANONYMIZED",
];

interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  timezone?: string | null;
  status?: string | null;
  twoFactorEnabled?: boolean | null;
}

function toAccountStatus(value: string | null | undefined): AccountStatus {
  if (value && (ACCOUNT_STATUSES as readonly string[]).includes(value)) {
    return value as AccountStatus;
  }
  throw new Error(`unexpected account status "${String(value)}"`);
}

function toAccount(user: AuthUser): AccountSummary {
  return {
    id: user.id,
    displayName: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    timezone: user.timezone ?? "Asia/Dhaka",
    accountStatus: toAccountStatus(user.status),
    mfaEnabled: user.twoFactorEnabled === true,
  };
}

function bearerHeaders(sessionToken: string): Headers {
  return new Headers({ authorization: `Bearer ${sessionToken}` });
}

/** The library signs its cookies as `<value>.<hmac>`; the bearer token is `<value>`. */
function setCookiePair(headers: Headers, suffix: string): string | null {
  for (const raw of headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const separator = pair.indexOf("=");
    if (separator < 1) {
      continue;
    }
    const name = pair.slice(0, separator);
    if (name === suffix || name.endsWith(`.${suffix}`)) {
      return pair;
    }
  }
  return null;
}

function cookieValue(pair: string): string {
  return decodeURIComponent(pair.slice(pair.indexOf("=") + 1));
}

/**
 * The session token a library response issued. The cookie is authoritative:
 * enrolling a factor rotates the session and the body can still carry the token
 * that was just deleted (design D2 sidebar in `design.md`).
 */
function issuedSessionToken(headers: Headers, fallback?: string | null): string | null {
  const pair = setCookiePair(headers, "session_token");
  if (pair) {
    return cookieValue(pair).split(".")[0] || null;
  }
  return fallback ?? null;
}

/** Only a cookie pair this API issued is replayed; anything else is a client error. */
function requireRelayedCookie(value: string, suffix: string): string {
  const separator = value.indexOf("=");
  const name = separator > 0 ? value.slice(0, separator) : "";
  if (!name.endsWith(`.${suffix}`) || value.length <= separator + 1) {
    throw new IdentityError("INVALID_CREDENTIALS", "the sign-in challenge is not valid");
  }
  return value;
}

function isInvalidCredentials(error: unknown): boolean {
  return (error as { statusCode?: number }).statusCode === 401;
}

/**
 * The library refuses a non-active sign-in with `403`. It carries either a
 * machine-readable `code` in the body or only a status code, so both resolve
 * (design D2). The only 403s `signInEmail` can raise are the verification gate
 * and this project's own session hook.
 */
function statusRefusal(error: unknown): IdentityErrorCode | null {
  const code = (error as { body?: { code?: unknown } }).body?.code;
  if (code === "EMAIL_NOT_VERIFIED" || code === "ACCOUNT_SUSPENDED" || code === "FORBIDDEN") {
    return code;
  }
  if ((error as { statusCode?: unknown }).statusCode !== 403) {
    return null;
  }
  // The remaining documented 403 source is the verification gate. Keep the
  // unexpected code in the log so a future 403 is diagnosable rather than
  // silently relabelled.
  console.warn(
    JSON.stringify({ event: "identity.sign_in_refused", code: typeof code === "string" ? code : "unknown" }),
  );
  return "EMAIL_NOT_VERIFIED";
}

function refusalMessage(code: IdentityErrorCode): string {
  switch (code) {
    case "ACCOUNT_SUSPENDED":
      return "this account is suspended";
    case "FORBIDDEN":
      return "this account cannot sign in";
    default:
      return "confirm your email address before signing in";
  }
}

function isDuplicateEmail(error: unknown): boolean {
  const body = (error as { body?: { code?: string } }).body;
  return body?.code === "USER_ALREADY_EXISTS";
}

export interface BetterAuthIdentityServiceOptions {
  auth: IdentityAuth;
  database: Database;
  secret: string;
  /** Social providers actually registered from the environment (design D3). */
  providerIds?: string[];
  now?: () => Date;
  /**
   * Test seam: the append-only writer. Production leaves it unset, so entries
   * go to `appendAuditEntry`; a fault-injection test can fail one action.
   */
  auditWriter?: (database: Database, entry: AuditEntry) => Promise<void>;
}

/** Audit writes go through one seam so a test can fault-inject a single action. */
type AuditWriter = (database: Database, entry: AuditEntry) => Promise<void>;

/**
 * The only place identity operations touch the library. Every method returns
 * project types and failures are `IdentityError`s (design D1).
 */
export class BetterAuthIdentityService implements IdentityService {
  private readonly auth: IdentityAuth;
  private readonly database: Database;
  private readonly secret: string;
  private readonly providerIds: string[];
  private readonly now: () => Date;
  private readonly auditWriter: AuditWriter;

  constructor({ auth, database, secret, providerIds, now, auditWriter }: BetterAuthIdentityServiceOptions) {
    this.auth = auth;
    this.database = database;
    this.secret = secret;
    this.providerIds = providerIds ?? [];
    this.now = now ?? (() => new Date());
    this.auditWriter = auditWriter ?? appendAuditEntry;
  }

  private writeAudit(entry: AuditEntry): Promise<void> {
    return this.auditWriter(this.database, entry);
  }

  async register(input: RegisterAccountInput): Promise<RegisterAccountResult> {
    const displayName = input.displayName;
    if (displayNameViolation(displayName)) {
      throw new IdentityError("VALIDATION_ERROR", "display name must be 1 to 100 characters");
    }
    if (passwordPolicyViolation(input.password)) {
      throw new IdentityError("VALIDATION_ERROR", "password must be at least 12 characters");
    }
    if (!isCalendarDate(input.dateOfBirth)) {
      throw new IdentityError("VALIDATION_ERROR", "date of birth must be a calendar date");
    }

    const email = input.email.trim().toLowerCase();
    const now = this.now();

    // The block exists to stop a resubmission with a changed date of birth, so
    // it is checked before the age gate (design D8). Nothing is written when it
    // matches, and the response is the same one the original attempt received.
    if (await this.isSignupBlocked(email, now)) {
      throw new IdentityError("UNDER_MINIMUM_AGE", "registration requires an age of 18 or older");
    }

    if (!isAtLeast18(input.dateOfBirth, now)) {
      await this.recordUnderageAttempt(email, now);
      throw new IdentityError("UNDER_MINIMUM_AGE", "registration requires an age of 18 or older");
    }

    // Enumeration protection: an existing address gets the same response as a
    // new one, and no consent or account rows are written (spec: duplicate email).
    const existing = await this.database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing.length > 0) {
      // Same password-hashing cost as the fresh path, which hashes inside
      // `signUpEmail`; the result is discarded so the response and its timing do
      // not reveal that the address already has an account (design D4).
      await hashPassword(input.password);
      return { status: "VERIFICATION_SENT" };
    }

    let userId: string;
    try {
      const created = await this.auth.api.signUpEmail({
        body: { name: displayName, email, password: input.password },
      });
      userId = created.user.id;
    } catch (error) {
      if (isDuplicateEmail(error)) {
        return { status: "VERIFICATION_SENT" };
      }
      const invalid = asValidationFailure(error);
      if (invalid) {
        throw invalid;
      }
      throw error;
    }

    try {
      await this.database.transaction(async (tx) => {
        await tx.insert(consentRecords).values([
          {
            userId,
            purpose: "TERMS",
            action: "GRANTED",
            documentVersion: CONSENT_DOCUMENT_VERSION,
          },
          {
            userId,
            purpose: "PRIVACY_NOTICE",
            action: "GRANTED",
            documentVersion: CONSENT_DOCUMENT_VERSION,
          },
        ]);
        await tx
          .update(users)
          .set({
            age18Plus: true,
            ageGatePassedAt: now,
            ageGateVersion: AGE_GATE_VERSION,
            timezone: input.timezone?.trim() || "Asia/Dhaka",
          })
          .where(eq(users.id, userId));
        await tx.insert(auditLogs).values({
          actorUserId: userId,
          actorRole: "USER",
          action: "USER_REGISTERED",
          objectType: "users",
          objectId: userId,
          requestId: input.requestId,
        });
      });
    } catch (error) {
      // The library owns its own transaction, so a failure here would leave an
      // account without consent records. Remove it rather than keep that state,
      // and keep the original error as the one the caller sees.
      try {
        await this.database.delete(users).where(eq(users.id, userId));
      } catch (cleanupError) {
        console.error(
          JSON.stringify({
            event: "identity.registration_cleanup_failed",
            user_id: userId,
            message: cleanupError instanceof Error ? cleanupError.message : "unknown error",
          }),
        );
      }
      throw error;
    }

    return { status: "VERIFICATION_SENT" };
  }

  async verifyEmail(input: VerifyEmailInput): Promise<void> {
    try {
      await runWithRequestId(input.requestId, () =>
        this.auth.api.verifyEmail({ query: { token: input.token } }),
      );
    } catch (error) {
      // Only a rejected link is a client error; a database or library fault must
      // surface as a server error instead of a 400.
      if (!isClientApiError(error)) {
        throw error;
      }
      throw new IdentityError("INVALID_VERIFICATION_LINK", "the verification link is invalid or expired");
    }
  }

  async signIn(input: SignInInput): Promise<SignInResult> {
    let headers: Headers;
    let result: { token?: string; user?: { id: string }; twoFactorRedirect?: boolean };
    try {
      // The session hook activates or resumes the account through
      // `currentRequestId()`, so the sign-in must carry the request context
      // (design D5). `returnHeaders` is required for the second-factor
      // challenge, which only exists as a cookie (design D2).
      const signIn = await runWithRequestId(input.requestId, () =>
        this.auth.api.signInEmail({
          body: { email: input.email.trim().toLowerCase(), password: input.password },
          returnHeaders: true,
        }),
      );
      headers = signIn.headers;
      result = signIn.response as typeof result;
    } catch (error) {
      const refusal = statusRefusal(error);
      if (!refusal && !isInvalidCredentials(error)) {
        const invalid = asValidationFailure(error);
        if (invalid) {
          throw invalid;
        }
        throw error;
      }
      await this.writeAudit({
        action: "SIGN_IN_FAILED",
        actorUserId: null,
        actorRole: "ANONYMOUS",
        objectType: "users",
        objectId: null,
        requestId: input.requestId,
        // No email, password, hash, or token: the attempt is identified by the
        // request id alone. A status refusal records the same shape, so the
        // two are indistinguishable outside the API.
        metadata: {},
      });
      if (refusal) {
        throw new IdentityError(refusal, refusalMessage(refusal));
      }
      throw new IdentityError("INVALID_CREDENTIALS", "invalid email or password");
    }

    // The library already deleted the session it created for this sign-in and
    // left only a challenge cookie (design D2).
    if (result.twoFactorRedirect) {
      const challenge = setCookiePair(headers, "two_factor");
      if (!challenge) {
        throw new Error("the second-factor challenge cookie was not issued");
      }
      return { mfaRequired: true, mfaChallenge: challenge };
    }

    const sessionToken = issuedSessionToken(headers, result.token);
    if (!sessionToken || !result.user) {
      throw new Error("the sign-in response carried no session");
    }
    let account: AccountSummary;
    let sessionId: string;
    try {
      // Always read the account back: the hook may have moved it to `ACTIVE`
      // after the library read the row, so `result.user` can be stale.
      account = await this.requireAccount(result.user.id);
      const session = await this.readSession(sessionToken);
      if (!session) {
        throw new Error("the new session could not be read back");
      }
      sessionId = session.sessionId;
    } catch (error) {
      // The library already created the session, so a failure after it must not
      // leave a usable token behind.
      await this.revokeIssuedSession(sessionToken, input.requestId);
      throw error;
    }

    try {
      await this.writeAudit({
        action: "SIGN_IN_SUCCEEDED",
        actorUserId: account.id,
        actorRole: "USER",
        objectType: "sessions",
        objectId: sessionId,
        requestId: input.requestId,
      });
    } catch (auditError) {
      // Fail closed: the library already created the session, so a response we
      // cannot record must not leave a usable token behind (design D5).
      await this.revokeIssuedSession(sessionToken, input.requestId);
      throw auditError;
    }

    return { mfaRequired: false, sessionToken, account };
  }

  /** Best effort: a failed revocation is logged with the request id, never hidden. */
  private async revokeIssuedSession(sessionToken: string, requestId: string): Promise<void> {
    try {
      await this.auth.api.signOut({ headers: bearerHeaders(sessionToken) });
    } catch (revokeError) {
      console.error(
        JSON.stringify({
          event: "identity.sign_in_audit_revoke_failed",
          request_id: requestId,
          message: revokeError instanceof Error ? revokeError.message : "unknown error",
        }),
      );
    }
  }

  async signOut(input: SessionInput): Promise<void> {
    const session = await this.requireSession(input.sessionToken);
    await this.auth.api.signOut({ headers: bearerHeaders(input.sessionToken) });
    await this.writeAudit({
      action: "SIGNED_OUT",
      actorUserId: session.account.id,
      actorRole: "USER",
      objectType: "sessions",
      objectId: session.sessionId,
      requestId: input.requestId,
    });
  }

  async signOutEverywhere(input: SessionInput): Promise<void> {
    const session = await this.requireSession(input.sessionToken);
    await this.auth.api.revokeSessions({ headers: bearerHeaders(input.sessionToken) });
    await this.writeAudit({
      action: "SIGNED_OUT_EVERYWHERE",
      actorUserId: session.account.id,
      actorRole: "USER",
      objectType: "users",
      objectId: session.account.id,
      requestId: input.requestId,
    });
  }

  async requestPasswordReset(input: PasswordResetRequestInput): Promise<void> {
    try {
      await this.auth.api.requestPasswordReset({
        body: { email: input.email.trim().toLowerCase() },
      });
    } catch (error) {
      const invalid = asValidationFailure(error);
      if (invalid) {
        throw invalid;
      }
      throw error;
    }
    await this.writeAudit({
      action: "PASSWORD_RESET_REQUESTED",
      actorUserId: null,
      actorRole: "ANONYMOUS",
      objectType: "users",
      objectId: null,
      requestId: input.requestId,
      // The response is identical for known and unknown addresses, so the
      // entry must not record the address either.
      metadata: {},
    });
  }

  async resetPassword(input: PasswordResetInput): Promise<void> {
    if (passwordPolicyViolation(input.password)) {
      throw new IdentityError("VALIDATION_ERROR", "password must be at least 12 characters");
    }

    try {
      await runWithRequestId(input.requestId, () =>
        this.auth.api.resetPassword({
          body: { newPassword: input.password, token: input.token },
        }),
      );
    } catch (error) {
      if (!isClientApiError(error)) {
        throw error;
      }
      throw new IdentityError("INVALID_RESET_TOKEN", "the reset link is invalid or expired");
    }
  }

  async getSession(input: SessionLookupInput): Promise<AccountSummary | null> {
    return (await this.readSession(input.sessionToken))?.account ?? null;
  }

  async activateAccount(input: ActivateAccountInput): Promise<AccountSummary> {
    await activatePendingAccount(this.database, input.userId, input.requestId);
    return this.requireAccount(input.userId);
  }

  async suspendAccount(input: SuspendAccountInput): Promise<AccountSummary> {
    return this.database.transaction(async (tx) => {
      const [suspended] = await tx
        .update(users)
        .set({ status: "SUSPENDED" })
        .where(eq(users.id, input.userId))
        .returning();
      if (!suspended) {
        throw new IdentityError("VALIDATION_ERROR", "the account does not exist");
      }

      // Same transaction as the status change: no window in which a suspended
      // account keeps a live session (design D4).
      await tx.delete(sessions).where(eq(sessions.userId, input.userId));
      await tx.insert(auditLogs).values({
        action: "ACCOUNT_SUSPENDED",
        actorUserId: input.actorUserId,
        actorRole: "PLATFORM_ADMIN",
        objectType: "users",
        objectId: input.userId,
        requestId: input.requestId,
        reason: input.reason,
      });

      return toAccount(suspended);
    });
  }

  async deactivateAccount(input: DeactivateAccountInput): Promise<void> {
    // The account id comes from the session, never from the request body.
    const session = await this.requireSession(input.sessionToken);

    await this.database.transaction(async (tx) => {
      // Only an ACTIVE account can pause itself. Without this condition a
      // deactivation racing a suspension would overwrite the sanction, and
      // signing in again would then lift it.
      const paused = await tx
        .update(users)
        .set({ status: "DEACTIVATED" })
        .where(and(eq(users.id, session.account.id), eq(users.status, "ACTIVE")))
        .returning({ id: users.id });
      if (paused.length === 0) {
        throw new IdentityError("SESSION_INVALID", "the session is not valid");
      }

      await tx.delete(sessions).where(eq(sessions.userId, session.account.id));
      await tx.insert(auditLogs).values({
        action: "ACCOUNT_DEACTIVATED",
        actorUserId: session.account.id,
        actorRole: "USER",
        objectType: "users",
        objectId: session.account.id,
        requestId: input.requestId,
      });
    });
  }

  async enrollMfa(input: EnrollMfaInput): Promise<MfaEnrollment> {
    const session = await this.requireSession(input.sessionToken);

    let enrollment: { totpURI?: string; backupCodes?: string[] };
    try {
      enrollment = (await this.auth.api.enableTwoFactor({
        body: { password: input.password },
        headers: bearerHeaders(input.sessionToken),
      })) as typeof enrollment;
    } catch (error) {
      // A wrong password and an already-enrolled factor are both input errors
      // (design D5); anything else is a real fault.
      if (isClientApiError(error)) {
        throw new IdentityError("VALIDATION_ERROR", "the password is not correct, or the factor is already enrolled");
      }
      throw error;
    }

    if (!enrollment.totpURI || !enrollment.backupCodes) {
      throw new Error("the enrollment response carried no TOTP URI");
    }

    // Metadata names the factor only: no secret, no URI, no backup code.
    await this.writeAudit({
      action: "MFA_ENROLLED",
      actorUserId: session.account.id,
      actorRole: "USER",
      objectType: "two_factors",
      objectId: null,
      requestId: input.requestId,
      metadata: { method: "totp" },
    });

    return { totpUri: enrollment.totpURI, backupCodes: enrollment.backupCodes };
  }

  async verifyMfa(input: VerifyMfaInput): Promise<VerifyMfaResult> {
    if (!input.sessionToken && !input.mfaChallenge) {
      throw new IdentityError("INVALID_CREDENTIALS", "a second-factor challenge or a session is required");
    }

    const headers = input.sessionToken
      ? bearerHeaders(input.sessionToken)
      : new Headers({ cookie: requireRelayedCookie(input.mfaChallenge ?? "", "two_factor") });

    let verification: { headers: Headers; response: { token?: string; user?: { id: string } } };
    try {
      const endpoint =
        input.method === "backup_code" ? this.auth.api.verifyBackupCode : this.auth.api.verifyTOTP;
      verification = (await endpoint({
        body: { code: input.code },
        headers,
        returnHeaders: true,
      })) as typeof verification;
    } catch (error) {
      // A wrong code, an expired challenge, an exhausted attempt counter, and a
      // lockout are all authentication outcomes; a fault still surfaces.
      if (!isClientApiError(error)) {
        throw error;
      }
      if (input.mfaChallenge) {
        // No actor: the same shape as a failed sign-in, so a challenge id never
        // becomes a way to learn which account it belongs to.
        await this.writeAudit({
          action: "MFA_VERIFICATION_FAILED",
          actorUserId: null,
          actorRole: "ANONYMOUS",
          objectType: "two_factors",
          objectId: null,
          requestId: input.requestId,
          metadata: {},
        });
      }
      throw new IdentityError("INVALID_CREDENTIALS", "the second-factor code is not valid");
    }

    // Enrolment verification rotates the session; the cookie is the new token.
    const sessionToken = issuedSessionToken(verification.headers, verification.response?.token);
    const userId = verification.response?.user?.id;
    if (!sessionToken || !userId) {
      throw new Error("the second-factor verification carried no session");
    }

    const account = await this.requireAccount(userId);
    await this.writeAudit({
      action: "MFA_VERIFIED",
      actorUserId: account.id,
      actorRole: "USER",
      objectType: "two_factors",
      objectId: null,
      requestId: input.requestId,
      metadata: { method: input.method ?? "totp" },
    });

    return { sessionToken, account };
  }

  async disableMfa(input: DisableMfaInput): Promise<DisableMfaResult> {
    const session = await this.requireSession(input.sessionToken);

    let result: { headers: Headers };
    try {
      result = (await this.auth.api.disableTwoFactor({
        body: { password: input.password },
        headers: bearerHeaders(input.sessionToken),
        returnHeaders: true,
      })) as typeof result;
    } catch (error) {
      if (isClientApiError(error)) {
        throw new IdentityError("VALIDATION_ERROR", "the password is not correct");
      }
      throw error;
    }

    // Removing the factor rotates the session, so the caller needs the new one.
    const sessionToken = issuedSessionToken(result.headers);
    if (!sessionToken) {
      throw new Error("disabling the second factor carried no session");
    }

    await this.writeAudit({
      action: "MFA_DISABLED",
      actorUserId: session.account.id,
      actorRole: "USER",
      objectType: "two_factors",
      objectId: null,
      requestId: input.requestId,
      metadata: {},
    });

    return { sessionToken };
  }

  async listSessions(input: ListSessionsInput): Promise<SessionSummary[]> {
    const session = await this.requireSession(input.sessionToken);

    const rows = await this.database
      .select({
        id: sessions.id,
        createdAt: sessions.createdAt,
        updatedAt: sessions.updatedAt,
        expiresAt: sessions.expiresAt,
        ipAddress: sessions.ipAddress,
        userAgent: sessions.userAgent,
      })
      .from(sessions)
      .where(and(eq(sessions.userId, session.account.id), gt(sessions.expiresAt, this.now())))
      .orderBy(desc(sessions.createdAt));

    // No `token` column is selected: the response can never carry one.
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      current: row.id === session.sessionId,
    }));
  }

  async revokeSession(input: RevokeSessionInput): Promise<void> {
    const session = await this.requireSession(input.sessionToken);

    const deleted = await this.database
      .delete(sessions)
      .where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, session.account.id)))
      .returning({ id: sessions.id });

    // Idempotent: a session id that is already gone is the caller's own
    // outcome, so it is a success. Another account's id is not (design D5).
    if (deleted.length === 0) {
      const [foreign] = await this.database
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.id, input.sessionId))
        .limit(1);
      if (foreign) {
        throw new IdentityError("SESSION_NOT_FOUND", "the session does not exist");
      }
      return;
    }

    await this.writeAudit({
      action: "SESSION_REVOKED",
      actorUserId: session.account.id,
      actorRole: "USER",
      objectType: "sessions",
      objectId: input.sessionId,
      requestId: input.requestId,
    });
  }

  async startProviderSignIn(input: ProviderSignInStartInput): Promise<ProviderSignInStart> {
    if (input.provider !== "google") {
      throw new IdentityError("VALIDATION_ERROR", "the provider is not supported");
    }
    if (!this.providerIds.includes("google")) {
      // No placeholder client id, no outbound request (design D3).
      throw new IdentityError("PROVIDER_UNAVAILABLE", "google sign-in is not configured");
    }

    try {
      const started = (await this.auth.api.signInSocial({
        body: { provider: "google", callbackURL: input.callbackUrl },
        returnHeaders: true,
      })) as { headers: Headers; response: { url?: string } };

      const stateCookie = setCookiePair(started.headers, "state");
      if (!started.response?.url || !stateCookie) {
        throw new Error("the provider start response carried no authorization URL");
      }
      return { authorizationUrl: started.response.url, stateCookie };
    } catch (error) {
      if (isClientApiError(error)) {
        throw new IdentityError("PROVIDER_UNAVAILABLE", "google sign-in could not be started");
      }
      throw error;
    }
  }

  async completeProviderSignIn(input: ProviderSignInCallbackInput): Promise<SignInResult> {
    if (input.provider !== "google" || !this.providerIds.includes("google")) {
      throw new IdentityError("PROVIDER_UNAVAILABLE", "google sign-in is not configured");
    }

    const cookie = requireRelayedCookie(input.stateCookie, "state");

    let response: Response;
    try {
      response = (await this.auth.api.callbackOAuth({
        params: { id: "google" },
        query: { code: input.code, state: input.state },
        headers: new Headers({ cookie }),
        asResponse: true,
      })) as Response;
    } catch (error) {
      // An altered or missing state and a rejected code are client failures; a
      // network fault is not, so it still surfaces as a server error.
      if (isClientApiError(error)) {
        throw new IdentityError("INVALID_CREDENTIALS", "the provider sign-in did not complete");
      }
      throw error;
    }

    const sessionToken = issuedSessionToken(response.headers);
    if (!sessionToken) {
      throw new IdentityError("INVALID_CREDENTIALS", "the provider sign-in did not complete");
    }

    const session = await this.readSession(sessionToken);
    if (!session) {
      throw new IdentityError("INVALID_CREDENTIALS", "the provider sign-in did not complete");
    }

    // The library gates only the password path on the second factor. Allowing a
    // provider sign-in to skip it would be a way around MFA for exactly the
    // accounts that must have it, so the session is withdrawn and the user is
    // sent back to the password flow (spec: "Second factor is not bypassed").
    const [account] = await this.database
      .select({ twoFactorEnabled: users.twoFactorEnabled })
      .from(users)
      .where(eq(users.id, session.account.id))
      .limit(1);
    if (account?.twoFactorEnabled) {
      await this.revokeIssuedSession(sessionToken, input.requestId);
      throw new IdentityError("FORBIDDEN", "sign in with your password and your second factor");
    }

    await this.writeAudit({
      action: "PROVIDER_SIGN_IN",
      actorUserId: session.account.id,
      actorRole: "USER",
      objectType: "sessions",
      objectId: session.sessionId,
      requestId: input.requestId,
      metadata: { provider: "google" },
    });

    return { mfaRequired: false, sessionToken, account: session.account };
  }

  private async readSession(
    sessionToken: string,
  ): Promise<{ sessionId: string; account: AccountSummary } | null> {
    try {
      const result = await this.auth.api.getSession({ headers: bearerHeaders(sessionToken) });
      return result ? { sessionId: result.session.id, account: toAccount(result.user) } : null;
    } catch (error) {
      // A rejected token is an authentication outcome; anything else is a real
      // fault and must not be reported as "signed out".
      if (!isClientApiError(error)) {
        throw error;
      }
      return null;
    }
  }

  private async requireSession(
    sessionToken: string,
  ): Promise<{ sessionId: string; account: AccountSummary }> {
    const session = await this.readSession(sessionToken);
    if (!session) {
      throw new IdentityError("SESSION_INVALID", "the session is not valid");
    }
    return session;
  }

  private async requireAccount(userId: string): Promise<AccountSummary> {
    const [user] = await this.database.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      throw new IdentityError("VALIDATION_ERROR", "the account does not exist");
    }
    return toAccount(user);
  }

  private async isSignupBlocked(email: string, now: Date): Promise<boolean> {
    const [block] = await this.database
      .select({ id: signupBlocks.id })
      .from(signupBlocks)
      .where(and(eq(signupBlocks.emailHash, this.emailHash(email)), gt(signupBlocks.expiresAt, now)))
      .limit(1);
    return block !== undefined;
  }

  private emailHash(email: string): string {
    return createHmac("sha256", this.secret).update(email.trim().toLowerCase()).digest("hex");
  }

  private async recordUnderageAttempt(email: string, now: Date): Promise<void> {
    const emailHash = this.emailHash(email);
    const expiresAt = new Date(now.getTime() + SIGNUP_BLOCK_DURATION_MS);

    await this.database
      .insert(signupBlocks)
      .values({ emailHash, reason: "UNDER_18", expiresAt })
      .onConflictDoUpdate({
        target: signupBlocks.emailHash,
        set: { reason: "UNDER_18", expiresAt },
      });
  }
}
