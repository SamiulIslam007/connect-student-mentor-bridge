import { and, eq, inArray, or, sql } from "drizzle-orm";

import { CONSENT_DOCUMENT_VERSION } from "@connect/config";
import { IdentityError } from "@connect/domain";

import type { Database } from "../db/database.js";
import {
  accounts,
  affiliations,
  auditLogs,
  availabilityWindows,
  consentRecords,
  mentorFields,
  mentorProfiles,
  mentorshipRequests,
  mentorshipSessions,
  mentorships,
  outcomeEvents,
  outcomes,
  privacyRequests,
  roleAssignments,
  sessions,
  studentFieldInterests,
  studentProfiles,
  threadMessages,
  twoFactors,
  users,
  verificationRecords,
} from "../db/schema/index.js";
import { appendAuditEntry, type AuditEntry } from "../identity/audit-log.js";
import { hashEmail } from "../identity/email-hash.js";
import {
  DELETED_DISPLAY_NAME,
  DELETED_MESSAGE_BODY,
  DELETED_PROVIDER_ACCOUNT_ID,
  PRIVACY_EXPORT_VERSION,
  type DeleteAccountInput,
  type ExportAccountInput,
  type PrivacyExportDocument,
  type PrivacyService,
} from "./privacy.service.js";

type AuditWriter = (database: Pick<Database, "insert">, entry: AuditEntry) => Promise<void>;

interface PrivacyOptions {
  database: Database;
  /** `BETTER_AUTH_SECRET`: the same key the signup block hashes with (D4). */
  secret: string;
  now?: () => Date;
  /** Fault-injection seam, as the identity service has (design R2, D-151). */
  auditWriter?: AuditWriter;
}

/**
 * Export and erasure (docs/api-contracts.md §5.8). The export is one
 * repeatable-read document built from a fixed allowlist; the deletion is one
 * transaction that never writes to the ledger (design D1–D3).
 */
export class DrizzlePrivacyService implements PrivacyService {
  private readonly database: Database;
  private readonly secret: string;
  private readonly now: () => Date;
  private readonly auditWriter: AuditWriter;

  constructor(options: PrivacyOptions) {
    this.database = options.database;
    this.secret = options.secret;
    this.now = options.now ?? (() => new Date());
    this.auditWriter = options.auditWriter ?? appendAuditEntry;
  }

  async exportAccount(input: ExportAccountInput): Promise<PrivacyExportDocument> {
    const generatedAt = this.now();

    return this.database.transaction(async (tx) => {
      // One snapshot for every section, so the document cannot mix two states.
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`);

      const [user] = await tx
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          email_verified: users.emailVerified,
          created_at: users.createdAt,
          timezone: users.timezone,
          status: users.status,
          age_18_plus: users.age18Plus,
          two_factor_enabled: users.twoFactorEnabled,
        })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!user) {
        throw new IdentityError("SESSION_INVALID", "the session is not valid");
      }

      // No password, no provider token: the provider name is all an export needs.
      const accountRows = await tx
        .select({ provider_id: accounts.providerId })
        .from(accounts)
        .where(eq(accounts.userId, input.userId));
      // No session token: the row identifies the device, not the credential.
      const sessionRows = await tx
        .select({ id: sessions.id, created_at: sessions.createdAt, expires_at: sessions.expiresAt })
        .from(sessions)
        .where(eq(sessions.userId, input.userId));

      const consents = await tx
        .select()
        .from(consentRecords)
        .where(eq(consentRecords.userId, input.userId));
      const audits = await tx
        .select()
        .from(auditLogs)
        .where(
          or(
            eq(auditLogs.actorUserId, input.userId),
            and(eq(auditLogs.objectType, "users"), eq(auditLogs.objectId, input.userId)),
          ),
        );
      const affiliationRows = await tx
        .select()
        .from(affiliations)
        .where(eq(affiliations.userId, input.userId));
      const availability = await tx
        .select()
        .from(availabilityWindows)
        .where(eq(availabilityWindows.userId, input.userId));
      const roles = await tx
        .select()
        .from(roleAssignments)
        .where(eq(roleAssignments.userId, input.userId));

      const [studentProfile] = await tx
        .select()
        .from(studentProfiles)
        .where(eq(studentProfiles.userId, input.userId))
        .limit(1);
      const studentInterests = studentProfile
        ? await tx
            .select()
            .from(studentFieldInterests)
            .where(eq(studentFieldInterests.studentProfileId, studentProfile.id))
        : [];

      const [mentorProfile] = await tx
        .select()
        .from(mentorProfiles)
        .where(eq(mentorProfiles.userId, input.userId))
        .limit(1);
      const mentorFieldRows = mentorProfile
        ? await tx
            .select()
            .from(mentorFields)
            .where(eq(mentorFields.mentorProfileId, mentorProfile.id))
        : [];

      const requestsSent = studentProfile
        ? await tx
            .select()
            .from(mentorshipRequests)
            .where(eq(mentorshipRequests.studentProfileId, studentProfile.id))
        : [];
      const requestsReceived = mentorProfile
        ? await tx
            .select()
            .from(mentorshipRequests)
            .where(eq(mentorshipRequests.mentorProfileId, mentorProfile.id))
        : [];

      const mentorshipConditions = [
        ...(studentProfile ? [eq(mentorships.studentProfileId, studentProfile.id)] : []),
        ...(mentorProfile ? [eq(mentorships.mentorProfileId, mentorProfile.id)] : []),
      ];
      const mentorshipRows =
        mentorshipConditions.length > 0
          ? await tx
              .select()
              .from(mentorships)
              .where(or(...mentorshipConditions))
          : [];
      const mentorshipIds = mentorshipRows.map((row) => row.id);

      // Only the caller's own messages: the counterpart's prose is not their data.
      const messages = await tx
        .select()
        .from(threadMessages)
        .where(eq(threadMessages.senderUserId, input.userId));
      const heldSessions =
        mentorshipIds.length > 0
          ? await tx
              .select()
              .from(mentorshipSessions)
              .where(inArray(mentorshipSessions.mentorshipId, mentorshipIds))
          : [];

      const outcomeRows = studentProfile
        ? await tx.select().from(outcomes).where(eq(outcomes.studentProfileId, studentProfile.id))
        : [];
      const outcomeIds = outcomeRows.map((row) => row.id);
      const events =
        outcomeIds.length > 0
          ? await tx
              .select()
              .from(outcomeEvents)
              .where(inArray(outcomeEvents.outcomeId, outcomeIds))
          : [];
      const verifications =
        outcomeIds.length > 0
          ? await tx
              .select()
              .from(verificationRecords)
              .where(inArray(verificationRecords.outcomeId, outcomeIds))
          : [];

      const tracking = await tx
        .select()
        .from(privacyRequests)
        .where(eq(privacyRequests.userId, input.userId));

      await tx.insert(privacyRequests).values({
        userId: input.userId,
        kind: "EXPORT",
        status: "COMPLETED",
        requestedAt: generatedAt,
        completedAt: generatedAt,
      });

      // One row per export, in the same transaction and after the document's own
      // audit section was read, so it is never inside the document it describes (D-151).
      await this.auditWriter(tx, {
        action: "DATA_EXPORTED",
        actorUserId: input.userId,
        // The same convention as the ACCOUNT_DELETED row: the caller is a user.
        actorRole: "USER",
        objectType: "users",
        objectId: input.userId,
        requestId: input.requestId,
      });

      return {
        export_version: PRIVACY_EXPORT_VERSION,
        generated_at: generatedAt.toISOString(),
        consent_document_version: CONSENT_DOCUMENT_VERSION,
        user,
        accounts: accountRows,
        sessions: sessionRows,
        consents,
        audit_entries: audits,
        affiliations: affiliationRows,
        availability_windows: availability,
        student_profile: studentProfile ?? null,
        student_field_interests: studentInterests,
        mentor_profile: mentorProfile ?? null,
        mentor_fields: mentorFieldRows,
        roles,
        requests_sent: requestsSent,
        requests_received: requestsReceived,
        mentorships: mentorshipRows,
        messages,
        mentorship_sessions: heldSessions,
        outcomes: outcomeRows,
        outcome_events: events,
        verification_records: verifications,
        privacy_requests: tracking,
      };
    });
  }

  async deleteAccount(input: DeleteAccountInput): Promise<{ status: "deleted" }> {
    return this.database.transaction(async (tx) => {
      // The row lock serializes two concurrent deletions of one account.
      const [account] = await tx
        .select({ id: users.id, email: users.email, status: users.status })
        .from(users)
        .where(eq(users.id, input.userId))
        .for("update")
        .limit(1);
      if (!account) {
        throw new IdentityError("VALIDATION_ERROR", "the account does not exist");
      }
      // Idempotent: a second request changes nothing and appends no second audit row.
      if (account.status === "ANONYMIZED") {
        return { status: "deleted" };
      }
      if (account.email.trim().toLowerCase() !== input.confirmEmail.trim().toLowerCase()) {
        throw new IdentityError("VALIDATION_ERROR", "confirm_email must match the account email");
      }

      const now = this.now();
      const deletedEmail = hashEmail(this.secret, account.email);

      await tx
        .update(users)
        .set({
          email: deletedEmail,
          name: DELETED_DISPLAY_NAME,
          image: null,
          lastSeenAt: null,
          status: "ANONYMIZED",
          anonymizedAt: now,
          twoFactorEnabled: false,
        })
        .where(eq(users.id, input.userId));

      // The provider link is severed but the row stays, so a provider sign-in
      // cannot silently re-create the account.
      await tx
        .update(accounts)
        .set({
          password: null,
          accessToken: null,
          refreshToken: null,
          idToken: null,
          scope: null,
          accountId: DELETED_PROVIDER_ACCOUNT_ID,
        })
        .where(eq(accounts.userId, input.userId));

      await tx.delete(sessions).where(eq(sessions.userId, input.userId));
      await tx.delete(twoFactors).where(eq(twoFactors.userId, input.userId));
      await tx.delete(availabilityWindows).where(eq(availabilityWindows.userId, input.userId));

      await tx
        .update(studentProfiles)
        .set({ goals: "", languages: [] })
        .where(eq(studentProfiles.userId, input.userId));

      // `status = REMOVED` is load-bearing: the directory and the single-mentor
      // read both key on ACTIVE, and neither joins `users.status` (D-85).
      await tx
        .update(mentorProfiles)
        .set({
          headline: "",
          bio: "",
          expertiseSummary: "",
          scopeStatement: "",
          languages: [],
          status: "REMOVED",
        })
        .where(eq(mentorProfiles.userId, input.userId));

      await tx
        .update(threadMessages)
        .set({ body: DELETED_MESSAGE_BODY })
        .where(eq(threadMessages.senderUserId, input.userId));

      await tx.insert(privacyRequests).values({
        userId: input.userId,
        kind: "DELETE",
        status: "COMPLETED",
        requestedAt: now,
        completedAt: now,
      });

      await this.auditWriter(tx, {
        action: "ACCOUNT_DELETED",
        actorUserId: input.userId,
        actorRole: "USER",
        objectType: "users",
        objectId: input.userId,
        requestId: input.requestId,
      });

      return { status: "deleted" };
    });
  }
}
