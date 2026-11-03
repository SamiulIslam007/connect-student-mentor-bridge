import { createHmac } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";
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
  type IdentityErrorCode,
  type IdentityService,
  type PasswordResetInput,
  type PasswordResetRequestInput,
  type RegisterAccountInput,
  type RegisterAccountResult,
  type SessionInput,
  type SessionLookupInput,
  type SignInInput,
  type SignInResult,
  type SuspendAccountInput,
  type VerifyEmailInput,
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
  };
}

function bearerHeaders(sessionToken: string): Headers {
  return new Headers({ authorization: `Bearer ${sessionToken}` });
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
  private readonly now: () => Date;
  private readonly auditWriter: AuditWriter;

  constructor({ auth, database, secret, now, auditWriter }: BetterAuthIdentityServiceOptions) {
    this.auth = auth;
    this.database = database;
    this.secret = secret;
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
    let result: Awaited<ReturnType<IdentityAuth["api"]["signInEmail"]>>;
    try {
      // The session hook activates or resumes the account through
      // `currentRequestId()`, so the sign-in must carry the request context
      // (design D5).
      result = await runWithRequestId(input.requestId, () =>
        this.auth.api.signInEmail({
          body: { email: input.email.trim().toLowerCase(), password: input.password },
        }),
      );
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

    const sessionToken = result.token;
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
      await this.revokeSession(sessionToken, input.requestId);
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
      await this.revokeSession(sessionToken, input.requestId);
      throw auditError;
    }

    return { sessionToken, account };
  }

  /** Best effort: a failed revocation is logged with the request id, never hidden. */
  private async revokeSession(sessionToken: string, requestId: string): Promise<void> {
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
