import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { bearer, twoFactor } from "better-auth/plugins";
import { eq } from "drizzle-orm";

import { decideSignIn } from "@connect/domain";

import type { Database } from "../db/database.js";
import { users } from "../db/schema/index.js";
import {
  passwordResetEmail,
  sendInBackground,
  verificationEmail,
  type EmailSender,
} from "../email/email-sender.js";
import { activatePendingAccount, resumeDeactivatedAccount } from "./account-activation.js";
import { appendAuditEntry } from "./audit-log.js";
import { currentRequestId } from "./request-context.js";

export const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30;
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;
export const VERIFICATION_EXPIRES_IN_SECONDS = 60 * 60 * 24;
export const RESET_TOKEN_EXPIRES_IN_SECONDS = 60 * 30;

export interface IdentityAuthDependencies {
  database: Database;
  emailSender: EmailSender;
  secret: string;
  baseUrl: string;
  /**
   * Present only when both variables are set (design D3). Absent, the provider
   * is not registered at all, so no placeholder client id can reach a URL.
   */
  google?: { clientId: string; clientSecret: string };
}

/**
 * better-auth is configured here and nowhere else (design D1). The schema is
 * the committed Drizzle schema; the library never generates or migrates it.
 */
export function createIdentityAuth({
  database,
  emailSender,
  secret,
  baseUrl,
  google,
}: IdentityAuthDependencies) {
  return betterAuth({
    database: drizzleAdapter(database, { provider: "pg", usePlural: true, transaction: true }),
    secret,
    baseURL: baseUrl,
    trustedOrigins: [baseUrl],
    plugins: [
      bearer(),
      // TOTP second factor (design D1). The plugin owns secret encryption,
      // backup codes, the sign-in gate, and the attempt limits; nothing here
      // re-implements them.
      twoFactor({ issuer: "connect" }),
    ],
    ...(google ? { socialProviders: { google } } : {}),
    user: {
      // Server-owned columns; a request body can never set them (design D4).
      additionalFields: {
        timezone: { type: "string", required: false, defaultValue: "Asia/Dhaka", input: false },
        status: { type: "string", required: false, defaultValue: "PENDING", input: false },
        age18Plus: { type: "boolean", required: false, defaultValue: false, input: false },
        ageGatePassedAt: { type: "date", required: false, input: false },
        ageGateVersion: { type: "string", required: false, input: false },
        lastSeenAt: { type: "date", required: false, input: false },
        anonymizedAt: { type: "date", required: false, input: false },
      },
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    databaseHooks: {
      session: {
        create: {
          // The single invariant: a session row exists only for an `ACTIVE`
          // account (design D2). Aborting the write is the only refusal the
          // library offers, and throwing keeps the specific reason.
          before: async (session) => {
            const [account] = await database
              .select({ status: users.status, emailVerified: users.emailVerified })
              .from(users)
              .where(eq(users.id, session.userId))
              .limit(1);

            if (!account) {
              throw new APIError("FORBIDDEN", { message: "this account cannot sign in", code: "FORBIDDEN" });
            }

            // Repair a verification whose activation write failed: the library
            // consumed the token and refuses to resend a link for a verified
            // address, so a `PENDING` + verified row would otherwise be locked
            // out for good. The write is the same idempotent activation.
            if (account.status === "PENDING" && account.emailVerified) {
              await activatePendingAccount(database, session.userId, currentRequestId());
              return;
            }

            const decision = decideSignIn(account.status);
            if (decision.action === "REFUSE") {
              throw new APIError("FORBIDDEN", {
                message: "this account cannot sign in",
                code: decision.code,
              });
            }
            if (decision.action === "ACTIVATE_THEN_ALLOW") {
              // Deactivation is a pause; signing in resumes it (design D5).
              // If the row was no longer `DEACTIVATED`, a suspension won the
              // race: refuse instead of allowing the session.
              // ponytail: the status read and the session insert are not in one
              // transaction, so a suspension committing between them can still
              // leave one live session. Close it in FR-ADM-05 by moving the
              // check into the library's transaction or by a DB guard.
              const resumed = await resumeDeactivatedAccount(database, session.userId, currentRequestId());
              if (!resumed) {
                throw new APIError("FORBIDDEN", {
                  message: "this account cannot sign in",
                  code: "FORBIDDEN",
                });
              }
            }
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      // Registration returns no session (spec: "a success without a session").
      autoSignIn: false,
      // Only a verified account signs in; the password is checked first, so the
      // refusal never discloses whether the address exists (SEC-AUTH-6).
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: RESET_TOKEN_EXPIRES_IN_SECONDS,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        sendInBackground(
          emailSender,
          passwordResetEmail(user.email, `${baseUrl}/reset?token=${encodeURIComponent(token)}`),
        );
      },
      onPasswordReset: async ({ user }) => {
        await appendAuditEntry(database, {
          action: "PASSWORD_RESET_COMPLETED",
          actorUserId: user.id,
          actorRole: "USER",
          objectType: "users",
          objectId: user.id,
          requestId: currentRequestId(),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // A refused sign-in for an unverified account sends a fresh link, which
      // is the resend action the web client offers.
      sendOnSignIn: true,
      expiresIn: VERIFICATION_EXPIRES_IN_SECONDS,
      sendVerificationEmail: async ({ user, token }) => {
        sendInBackground(
          emailSender,
          verificationEmail(user.email, `${baseUrl}/api/auth/verify?token=${encodeURIComponent(token)}`),
        );
      },
      afterEmailVerification: async (user) => {
        await appendAuditEntry(database, {
          action: "EMAIL_VERIFIED",
          actorUserId: user.id,
          actorRole: "USER",
          objectType: "users",
          objectId: user.id,
          requestId: currentRequestId(),
        });
        await activatePendingAccount(database, user.id, currentRequestId());
      },
    },
  });
}

export type IdentityAuth = ReturnType<typeof createIdentityAuth>;
