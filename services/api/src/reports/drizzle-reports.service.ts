import { and, count, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";

import { IdentityError } from "@connect/domain";

import type { Database } from "../db/database.js";
import {
  auditLogs,
  mentorProfiles,
  mentorships,
  outcomes,
  reports,
  studentProfiles,
  threadMessages,
  users,
} from "../db/schema/index.js";
import { appendAuditEntry } from "../identity/audit-log.js";
import { enqueueOutboxEvent } from "../platform/outbox/outbox.js";
import type {
  CreateReportInput,
  LiftSuspensionInput,
  LiftSuspensionResult,
  ListReportsInput,
  ReportPage,
  ReportRecord,
  ReportsService,
  ResolveReportInput,
  WarnAccountInput,
  WarnAccountResult,
} from "./reports.service.js";

function toRecord(row: typeof reports.$inferSelect): ReportRecord {
  return {
    id: row.id,
    reporterUserId: row.reporterUserId,
    targetKind: row.targetKind,
    targetId: row.targetId,
    reason: row.reason,
    details: row.details,
    status: row.status,
    decision: row.decision,
    resolutionReason: row.resolutionReason,
    resolvedByUserId: row.resolvedByUserId,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
    mentorshipId: null,
    warningCount: 0,
  };
}

/**
 * Reports and sanctions (docs/api-contracts.md §5.9). Visibility per target kind
 * is checked in SQL against the same rows the read routes use, so a report can
 * never name something the reporter could not see (design D1).
 */
export class DrizzleReportsService implements ReportsService {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  private async canSee(
    executor: Database,
    reporterUserId: string,
    targetKind: ReportRecord["targetKind"],
    targetId: string,
  ): Promise<boolean> {
    switch (targetKind) {
      case "USER": {
        const found = await executor
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, targetId), sql`${users.id} <> ${reporterUserId}`))
          .limit(1);
        return found.length > 0;
      }
      case "MESSAGE": {
        const found = await executor
          .select({ id: threadMessages.id })
          .from(threadMessages)
          .innerJoin(mentorships, eq(mentorships.id, threadMessages.mentorshipId))
          .innerJoin(studentProfiles, eq(studentProfiles.id, mentorships.studentProfileId))
          .innerJoin(mentorProfiles, eq(mentorProfiles.id, mentorships.mentorProfileId))
          .where(
            and(
              eq(threadMessages.id, targetId),
              sql`(student_profiles.user_id = ${reporterUserId} OR mentor_profiles.user_id = ${reporterUserId})`,
            ),
          )
          .limit(1);
        return found.length > 0;
      }
      case "PROFILE": {
        const found = await executor
          .select({ id: mentorProfiles.id })
          .from(mentorProfiles)
          .where(
            and(
              eq(mentorProfiles.id, targetId),
              sql`(${mentorProfiles.userId} = ${reporterUserId} OR ${mentorProfiles.status} = 'ACTIVE')`,
            ),
          )
          .limit(1);
        return found.length > 0;
      }
      case "OUTCOME": {
        const found = await executor
          .select({ id: outcomes.id })
          .from(outcomes)
          .innerJoin(mentorships, eq(mentorships.id, outcomes.mentorshipId))
          .innerJoin(studentProfiles, eq(studentProfiles.id, mentorships.studentProfileId))
          .innerJoin(mentorProfiles, eq(mentorProfiles.id, mentorships.mentorProfileId))
          .where(
            and(
              eq(outcomes.id, targetId),
              sql`(student_profiles.user_id = ${reporterUserId} OR mentor_profiles.user_id = ${reporterUserId})`,
            ),
          )
          .limit(1);
        return found.length > 0;
      }
      default:
        return false;
    }
  }

  async create(input: CreateReportInput): Promise<ReportRecord> {
    // `target_kind` and `target_id` shapes are validated by the controller; the
    // visibility rule is here, and a refusal is the same `404` as an absent id.
    const visible = await this.canSee(
      this.database,
      input.reporterUserId,
      input.targetKind,
      input.targetId,
    );
    if (!visible) {
      throw new IdentityError("SESSION_NOT_FOUND", "the reported object does not exist");
    }

    const [inserted] = await this.database
      .insert(reports)
      .values({
        reporterUserId: input.reporterUserId,
        targetKind: input.targetKind,
        targetId: input.targetId,
        reason: input.reason,
        details: input.details ?? null,
      })
      .returning();
    return toRecord(inserted);
  }

  async list(input: ListReportsInput): Promise<ReportPage> {
    const rows = await this.database
      .select()
      .from(reports)
      .where(
        input.cursor
          ? and(
              eq(reports.status, "OPEN"),
              sql`(${reports.createdAt}, ${reports.id}) > (SELECT created_at, id FROM reports WHERE id = ${input.cursor})`,
            )
          : eq(reports.status, "OPEN"),
      )
      .orderBy(reports.createdAt, reports.id)
      .limit(input.limit + 1);

    const page = rows.slice(0, input.limit).map(toRecord);
    await this.attachMentorshipIds(page);
    await this.attachWarningCounts(page);
    return {
      reports: page,
      nextCursor: rows.length > input.limit ? page[page.length - 1].id : null,
    };
  }

  /**
   * One lookup for the whole page: a reported message carries the mentorship the
   * admin page needs to form the break-glass route (design R1). Any other target
   * keeps null.
   */
  private async attachMentorshipIds(page: ReportRecord[]): Promise<void> {
    const messageIds = page
      .filter((report) => report.targetKind === "MESSAGE")
      .map((report) => report.targetId);
    if (messageIds.length === 0) {
      return;
    }
    const found = await this.database
      .select({ id: threadMessages.id, mentorshipId: threadMessages.mentorshipId })
      .from(threadMessages)
      .where(inArray(threadMessages.id, messageIds));
    const byMessage = new Map(found.map((row) => [row.id, row.mentorshipId]));
    for (const report of page) {
      if (report.targetKind === "MESSAGE") {
        report.mentorshipId = byMessage.get(report.targetId) ?? null;
      }
    }
  }

  async resolve(input: ResolveReportInput): Promise<ReportRecord> {
    return this.database.transaction(async (tx) => {
      const now = new Date();
      // One conditional update: a second resolution affects zero rows.
      const [resolved] = await tx
        .update(reports)
        .set({
          status: input.decision === "ACTIONED" ? "RESOLVED" : "DISMISSED",
          decision: input.decision,
          resolutionReason: input.reason,
          resolvedByUserId: input.adminUserId,
          resolvedAt: now,
        })
        .where(and(eq(reports.id, input.reportId), eq(reports.status, "OPEN")))
        .returning();
      if (!resolved) {
        throw new IdentityError("REPORT_ALREADY_RESOLVED", "this report is already resolved");
      }

      await appendAuditEntry(tx, {
        action: "REPORT_RESOLVED",
        actorUserId: input.adminUserId,
        actorRole: "PLATFORM_ADMIN",
        objectType: "reports",
        objectId: resolved.id,
        requestId: input.requestId,
        reason: input.reason,
        metadata: { decision: input.decision, target_kind: resolved.targetKind },
      });

      // The reporter is told the outcome, never the sanction or the reporter's
      // own identity to anyone else (D-90).
      const [reporter] = await tx
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, resolved.reporterUserId))
        .limit(1);
      if (reporter) {
        await enqueueOutboxEvent(tx, {
          aggregateType: "REPORT",
          aggregateId: resolved.id,
          eventType: "EmailRequested",
          dedupeKey: `email:report-resolved:${resolved.id}`,
          payload: {
            to: reporter.email,
            template: "report-resolved",
            subject: "Your connect report was resolved",
            text: [
              "A report you filed has been reviewed and resolved.",
              "",
              `Decision: ${input.decision === "ACTIONED" ? "the report was actioned" : "the report was dismissed"}.`,
              "Thank you for telling us. We do not share what action was taken against another account.",
            ].join("\n"),
          },
        });
      }

      return toRecord(resolved);
    });
  }

  /**
   * One grouped count for the page: a reported account's warnings are derived
   * from the append-only rows, never stored twice (D-139).
   */
  private async attachWarningCounts(page: ReportRecord[]): Promise<void> {
    const accountIds = page
      .filter((report) => report.targetKind === "USER")
      .map((report) => report.targetId);
    if (accountIds.length === 0) {
      return;
    }
    const counted = await this.database
      .select({ objectId: auditLogs.objectId, total: count() })
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "ACCOUNT_WARNED"), inArray(auditLogs.objectId, accountIds)))
      .groupBy(auditLogs.objectId);
    const byAccount = new Map(counted.map((row) => [row.objectId, Number(row.total)]));
    for (const report of page) {
      if (report.targetKind === "USER") {
        report.warningCount = byAccount.get(report.targetId) ?? 0;
      }
    }
  }

  /**
   * A warning is a fact on the record and nothing else: no status change, no
   * session touched, no end date written (D-139).
   */
  async warnAccount(input: WarnAccountInput): Promise<WarnAccountResult> {
    return this.database.transaction(async (tx) => {
      const [account] = await tx
        .select({ id: users.id, email: users.email, status: users.status })
        .from(users)
        .where(eq(users.id, input.accountId))
        .limit(1);
      if (!account) {
        throw new IdentityError("VALIDATION_ERROR", "the account does not exist");
      }

      await appendAuditEntry(tx, {
        action: "ACCOUNT_WARNED",
        actorUserId: input.adminUserId,
        actorRole: "PLATFORM_ADMIN",
        objectType: "users",
        objectId: account.id,
        requestId: input.requestId,
        reason: input.reason,
      });

      // The notice carries the reason and names nobody else (R6).
      await enqueueOutboxEvent(tx, {
        aggregateType: "USER",
        aggregateId: account.id,
        eventType: "EmailRequested",
        dedupeKey: `email:account-warned:${account.id}:${input.requestId}`,
        payload: {
          to: account.email,
          template: "account-warned",
          subject: "A warning about your connect account",
          text: [
            "A moderator has reviewed your activity and issued a warning.",
            "",
            `Reason: ${input.reason}`,
            "",
            "This warning does not change your account status. Further reports may lead to a suspension.",
          ].join("\n"),
        },
      });

      const warnings = await tx
        .select({ total: count() })
        .from(auditLogs)
        .where(and(eq(auditLogs.action, "ACCOUNT_WARNED"), eq(auditLogs.objectId, account.id)));
      return { status: account.status, warningCount: Number(warnings[0]?.total ?? 0) };
    });
  }

  /**
   * One conditional update, so a concurrent suspension wins instead of being
   * overwritten (D-140). The route lifts any suspended account; the job only one
   * whose stored end date has passed, and never one with no end date (D-141).
   */
  async liftSuspension(input: LiftSuspensionInput): Promise<LiftSuspensionResult> {
    return this.database.transaction(async (tx) => {
      const conditions = [eq(users.id, input.accountId), eq(users.status, "SUSPENDED")];
      if (input.source === "job") {
        conditions.push(isNotNull(users.suspendedUntil));
        conditions.push(lte(users.suspendedUntil, input.asOf ?? new Date()));
      }

      const [lifted] = await tx
        .update(users)
        .set({ status: "ACTIVE", suspendedUntil: null })
        .where(and(...conditions))
        .returning({ id: users.id, email: users.email });
      if (!lifted) {
        if (input.source === "job") {
          return { lifted: false, status: null };
        }
        throw new IdentityError("ACCOUNT_NOT_SUSPENDED", "this account is not suspended");
      }

      await appendAuditEntry(tx, {
        action: "ACCOUNT_REINSTATED",
        actorUserId: input.actorUserId,
        actorRole: input.actorUserId === null ? "SYSTEM" : "PLATFORM_ADMIN",
        objectType: "users",
        objectId: lifted.id,
        requestId: input.requestId,
        reason: input.reason,
        metadata: { source: input.source },
      });

      await enqueueOutboxEvent(tx, {
        aggregateType: "USER",
        aggregateId: lifted.id,
        eventType: "EmailRequested",
        dedupeKey: `email:account-reinstated:${lifted.id}:${input.requestId}`,
        payload: {
          to: lifted.email,
          template: "account-reinstated",
          subject: "Your connect account is active again",
          text: [
            "Your connect account is active again.",
            "",
            `Reason: ${input.reason}`,
            "",
            "Sign in with your own password; no session was created for you.",
          ].join("\n"),
        },
      });

      return { lifted: true, status: "ACTIVE" };
    });
  }
}
