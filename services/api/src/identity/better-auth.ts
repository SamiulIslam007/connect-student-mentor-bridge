import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";

import type { Database } from "../db/database.js";
import {
  passwordResetEmail,
  sendInBackground,
  verificationEmail,
  type EmailSender,
} from "../email/email-sender.js";
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
}: IdentityAuthDependencies) {
  return betterAuth({
    database: drizzleAdapter(database, { provider: "pg", usePlural: true, transaction: true }),
    secret,
    baseURL: baseUrl,
    trustedOrigins: [baseUrl],
    plugins: [bearer()],
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
    emailAndPassword: {
      enabled: true,
      // Registration returns no session (spec: "a success without a session").
      autoSignIn: false,
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
      },
    },
  });
}

export type IdentityAuth = ReturnType<typeof createIdentityAuth>;
