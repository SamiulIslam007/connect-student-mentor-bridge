import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { RATE_LIMITS } from "@connect/config";
import { IdentityError, type IdentityService } from "@connect/domain";

import { requireRole } from "../authorization/authorize.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import { REPORT_DECISIONS, type ReportDecision, type ReportRecord, type ReportsService } from "./reports.service.js";
import { REPORTS_SERVICE } from "./reports.tokens.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

function requiredText(body: unknown, field: string, maxLength: number): string {
  const value = bodyRecord(body)[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new IdentityError("VALIDATION_ERROR", `${field} is required`);
  }
  if (value.trim().length > maxLength) {
    throw new IdentityError("VALIDATION_ERROR", `${field} is longer than ${maxLength} characters`);
  }
  return value.trim();
}

function adminPayload(report: ReportRecord): Record<string, unknown> {
  return {
    id: report.id,
    reporter_user_id: report.reporterUserId,
    target_kind: report.targetKind.toLowerCase(),
    target_id: report.targetId,
    reason: report.reason,
    details: report.details,
    status: report.status.toLowerCase(),
    decision: report.decision?.toLowerCase() ?? null,
    resolution_reason: report.resolutionReason,
    resolved_by_user_id: report.resolvedByUserId,
    resolved_at: report.resolvedAt?.toISOString() ?? null,
    created_at: report.createdAt.toISOString(),
  };
}

/**
 * The admin surface (docs/api-contracts.md §5.9): the report queue, one resolution
 * per report, and the first admin write — suspension. Every route requires
 * `PLATFORM_ADMIN` with an enrolled second factor (D-76/D-77 pattern).
 */
@Controller("v1")
export class ReportsAdminController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(REPORTS_SERVICE) private readonly reports: ReportsService,
  ) {}

  @Get("reports")
  async list(
    @Query("cursor") cursor: unknown,
    @Query("limit") limit: unknown,
    @Req() request: RequestWithId,
  ): Promise<{ data: Record<string, unknown>[]; next_cursor: string | null }> {
    await requireRole(this.identity, request, "PLATFORM_ADMIN", { requiresMfa: true });

    const rawCursor = typeof cursor === "string" ? cursor.trim() : "";
    if (rawCursor && !UUID_PATTERN.test(rawCursor)) {
      throw new IdentityError("VALIDATION_ERROR", "cursor is not a report id");
    }
    const rawLimit = typeof limit === "string" ? limit : "";
    const parsed = rawLimit === "" ? 20 : Number(rawLimit);
    if (!/^\d*$/.test(rawLimit) || !Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
      throw new IdentityError("VALIDATION_ERROR", "limit must be a whole number from 1 to 50");
    }

    const page = await this.reports.list({ limit: parsed, ...(rawCursor ? { cursor: rawCursor } : {}) });
    return { data: page.reports.map(adminPayload), next_cursor: page.nextCursor };
  }

  @Throttle({ default: RATE_LIMITS.write })
  @Post("reports/:id/resolve")
  @HttpCode(200)
  async resolve(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await requireRole(this.identity, request, "PLATFORM_ADMIN", { requiresMfa: true });
    if (!UUID_PATTERN.test(id)) {
      throw new IdentityError("VALIDATION_ERROR", "the report id is not valid");
    }

    const decision = requiredText(body, "decision", 20).toUpperCase() as ReportDecision;
    if (!REPORT_DECISIONS.includes(decision)) {
      throw new IdentityError("VALIDATION_ERROR", "decision must be actioned or dismissed");
    }
    const reason = requiredText(body, "reason", 1000);

    const report = await this.reports.resolve({
      reportId: id,
      adminUserId: acting.account.id,
      decision,
      reason,
      requestId: request.requestId,
    });
    return adminPayload(report);
  }

  @Throttle({ default: RATE_LIMITS.write })
  @Post("admin/accounts/:id/suspend")
  @HttpCode(200)
  async suspend(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<{ status: string; suspended_until: string | null }> {
    const acting = await requireRole(this.identity, request, "PLATFORM_ADMIN", { requiresMfa: true });

    const reason = requiredText(body, "reason", 1000);
    const rawEndDate = bodyRecord(body).end_date;
    if (rawEndDate !== undefined && rawEndDate !== null) {
      if (typeof rawEndDate !== "string" || !DATE_PATTERN.test(rawEndDate)) {
        throw new IdentityError("VALIDATION_ERROR", "end_date must be a calendar date (YYYY-MM-DD)");
      }
    }

    const account = await this.identity.suspendAccount({
      userId: id,
      reason,
      ...(typeof rawEndDate === "string" ? { suspendedUntil: rawEndDate } : {}),
      actorUserId: acting.account.id,
      requestId: request.requestId,
    });
    return { status: account.accountStatus.toLowerCase(), suspended_until: rawEndDate ?? null };
  }
}
