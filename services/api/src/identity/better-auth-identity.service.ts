import { createHmac } from "node:crypto";

import { eq } from "drizzle-orm";

import {
  AGE_GATE_VERSION,
  displayNameViolation,
  IdentityError,
  isAtLeast18,
  isCalendarDate,
  passwordPolicyViolation,
  type AccountStatus,
  type AccountSummary,
  type IdentityService,
  type PasswordResetInput,
  type PasswordResetRequestInput,
  type RegisterAccountInput,
  type RegisterAccountResult,
  type SessionInput,
  type SessionLookupInput,
  type SignInInput,
  type SignInResult,
  type VerifyEmailInput,
} from "@connect/domain";

import type { Database } from "../db/database.js";
import { auditLogs, consentRecords, signupBlocks, users } from "../db/schema/index.js";
import type { IdentityAuth } from "./better-auth.js";
import { appendAuditEntry } from "./audit-log.js";
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

function isDuplicateEmail(error: unknown): boolean {
  const body = (error as { body?: { code?: string } }).body;
  return body?.code === "USER_ALREADY_EXISTS";
}

export interface BetterAuthIdentityServiceOptions {
  auth: IdentityAuth;
  database: Database;
  secret: string;
  now?: () => Date;
}

/**
 * The only place identity operations touch the library. Every method returns
 * project types and failures are `IdentityError`s (design D1).
 */
export class BetterAuthIdentityService implements IdentityService {
  private readonly auth: IdentityAuth;
  private readonly database: Database;
  private readonly secret: string;
  private readonly now: () => Date;

  constructor({ auth, database, secret, now }: BetterAuthIdentityServiceOptions) {
    this.auth = auth;
    this.database = database;
    this.secret = secret;
    this.now = now ?? (() => new Date());
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

    const now = this.now();
    if (!isAtLeast18(input.dateOfBirth, now)) {
      await this.recordUnderageAttempt(input.email, now);
      throw new IdentityError("UNDER_MINIMUM_AGE", "registration requires an age of 18 or older");
    }

    const email = input.email.trim().toLowerCase();

    // Enumeration protection: an existing address gets the same response as a
    // new one, and no consent or account rows are written (spec: duplicate email).
    const existing = await this.database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing.length > 0) {
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
      // account without consent records. Remove it rather than keep that state.
      await this.database.delete(users).where(eq(users.id, userId));
      throw error;
    }

    return { status: "VERIFICATION_SENT" };
  }

  async verifyEmail(input: VerifyEmailInput): Promise<void> {
    try {
      await runWithRequestId(input.requestId, () =>
        this.auth.api.verifyEmail({ query: { token: input.token } }),
      );
    } catch {
      throw new IdentityError("INVALID_VERIFICATION_LINK", "the verification link is invalid or expired");
    }
  }

  async signIn(input: SignInInput): Promise<SignInResult> {
    let account: AccountSummary;
    let sessionToken: string;
    let sessionId: string | null;
    try {
      const result = await this.auth.api.signInEmail({
        body: { email: input.email.trim().toLowerCase(), password: input.password },
      });
      account = toAccount(result.user);
      sessionToken = result.token;
      sessionId = (await this.readSession(sessionToken))?.sessionId ?? null;
    } catch (error) {
      if (!isInvalidCredentials(error)) {
        throw error;
      }
      await appendAuditEntry(this.database, {
        action: "SIGN_IN_FAILED",
        actorUserId: null,
        actorRole: "ANONYMOUS",
        objectType: "users",
        objectId: null,
        requestId: input.requestId,
        // No email, password, hash, or token: the attempt is identified by the
        // request id alone.
        metadata: {},
      });
      throw new IdentityError("INVALID_CREDENTIALS", "invalid email or password");
    }

    await appendAuditEntry(this.database, {
      action: "SIGN_IN_SUCCEEDED",
      actorUserId: account.id,
      actorRole: "USER",
      objectType: "sessions",
      objectId: sessionId,
      requestId: input.requestId,
    });

    return { sessionToken, account };
  }

  async signOut(input: SessionInput): Promise<void> {
    const session = await this.requireSession(input.sessionToken);
    await this.auth.api.signOut({ headers: bearerHeaders(input.sessionToken) });
    await appendAuditEntry(this.database, {
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
    await appendAuditEntry(this.database, {
      action: "SIGNED_OUT_EVERYWHERE",
      actorUserId: session.account.id,
      actorRole: "USER",
      objectType: "users",
      objectId: session.account.id,
      requestId: input.requestId,
    });
  }

  async requestPasswordReset(input: PasswordResetRequestInput): Promise<void> {
    await this.auth.api.requestPasswordReset({
      body: { email: input.email.trim().toLowerCase() },
    });
    await appendAuditEntry(this.database, {
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
    } catch {
      throw new IdentityError("INVALID_RESET_TOKEN", "the reset link is invalid or expired");
    }
  }

  async getSession(input: SessionLookupInput): Promise<AccountSummary | null> {
    return (await this.readSession(input.sessionToken))?.account ?? null;
  }

  private async readSession(
    sessionToken: string,
  ): Promise<{ sessionId: string; account: AccountSummary } | null> {
    try {
      const result = await this.auth.api.getSession({ headers: bearerHeaders(sessionToken) });
      return result ? { sessionId: result.session.id, account: toAccount(result.user) } : null;
    } catch {
      // An unparseable or rejected token is an authentication outcome, not a
      // server error.
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

  private async recordUnderageAttempt(email: string, now: Date): Promise<void> {
    const emailHash = createHmac("sha256", this.secret)
      .update(email.trim().toLowerCase())
      .digest("hex");
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
