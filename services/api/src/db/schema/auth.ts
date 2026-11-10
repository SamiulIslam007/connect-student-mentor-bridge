import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { accountStatus } from "./enums.js";

/**
 * Library-native tables for better-auth 1.7.15 (schema shape verified against
 * the v1.7.15 Drizzle PostgreSQL snapshot on 2026-11-03). Table and column
 * names are identical to the library's defaults because the adapter is
 * configured with `usePlural: true` and no field remapping.
 */

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  /** Display name (1 to 100 characters, any Unicode script). */
  name: text("name").notNull(),
  /** Stored lowercase by the library. */
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  // Server-owned project columns. Declared to better-auth with `input: false`;
  // the library never accepts them from a request body.
  timezone: text("timezone").default("Asia/Dhaka").notNull(),
  status: accountStatus("status").default("PENDING").notNull(),
  age18Plus: boolean("age_18_plus").default(false).notNull(),
  ageGatePassedAt: timestamp("age_gate_passed_at", { withTimezone: true }),
  ageGateVersion: text("age_gate_version"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
  /** Stored, shown, and audited by a suspension; never lifted automatically (D-88). */
  suspendedUntil: timestamp("suspended_until", { withTimezone: true }),
  // Owned by the `twoFactor` plugin (`input: false`, so a request body can
  // never set it). Written only by the library's enable/disable endpoints.
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

/**
 * The `twoFactor` plugin's own table (shape from
 * `better-auth@1.7.15/dist/plugins/two-factor/schema.d.mts`). `secret` and
 * `backupCodes` hold library-encrypted values; nothing reads them back into
 * application code.
 */
export const twoFactors = pgTable(
  "two_factors",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true).notNull(),
    failedVerificationCount: integer("failed_verification_count").default(0).notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("two_factors_user_id_idx").on(table.userId),
    index("two_factors_secret_idx").on(table.secret),
  ],
);
