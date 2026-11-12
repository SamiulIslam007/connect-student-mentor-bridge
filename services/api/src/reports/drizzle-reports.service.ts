import { and, eq, inArray, sql } from "drizzle-orm";

import { IdentityError } from "@connect/domain";

import type { Database } from "../db/database.js";
import {
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
  ListReportsInput,
  ReportPage,
  ReportRecord,
  ReportsService,
  ResolveReportInput,
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
}
