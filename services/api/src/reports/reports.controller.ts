import { Body, Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { RATE_LIMITS } from "@connect/config";
import { IdentityError, type IdentityService } from "@connect/domain";

import { actingAccountWithRoles } from "../authorization/authorize.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import { REPORT_REASONS, REPORT_TARGET_KINDS } from "./reports.service.js";
import type { ReportRecord, ReportReason, ReportTargetKind, ReportsService } from "./reports.service.js";
import { REPORTS_SERVICE } from "./reports.tokens.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

function stringField(body: unknown, field: string, maxLength: number): string {
  const value = bodyRecord(body)[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new IdentityError("VALIDATION_ERROR", `${field} is required`);
  }
  if (value.trim().length > maxLength) {
    throw new IdentityError("VALIDATION_ERROR", `${field} is longer than ${maxLength} characters`);
  }
  return value.trim();
}

function reportPayload(report: ReportRecord): Record<string, unknown> {
  return {
    id: report.id,
    target_kind: report.targetKind.toLowerCase(),
    target_id: report.targetId,
    reason: report.reason,
    status: report.status.toLowerCase(),
    created_at: report.createdAt.toISOString(),
    ...(report.decision ? { decision: report.decision.toLowerCase() } : {}),
    ...(report.resolutionReason ? { resolution_reason: report.resolutionReason } : {}),
  };
}

/**
 * `POST /v1/reports` (docs/api-contracts.md §5.9). Any signed-in user, and the
 * reporter's identity is never returned to the reported party (design D1/D2).
 */
@Controller("v1/reports")
export class ReportsController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(REPORTS_SERVICE) private readonly reports: ReportsService,
  ) {}

  @Throttle({ default: RATE_LIMITS.write })
  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown, @Req() request: RequestWithId): Promise<Record<string, unknown>> {
    const acting = await actingAccountWithRoles(this.identity, request);

    const rawKind = stringField(body, "target_kind", 20).toUpperCase() as ReportTargetKind;
    if (!REPORT_TARGET_KINDS.includes(rawKind)) {
      throw new IdentityError("VALIDATION_ERROR", "target_kind must be user, message, profile, or outcome");
    }
    const targetId = stringField(body, "target_id", 200);
    const rawReason = stringField(body, "reason", 40).toUpperCase() as ReportReason;
    if (!REPORT_REASONS.includes(rawReason)) {
      throw new IdentityError("VALIDATION_ERROR", "reason is not a documented value");
    }
    // A user id is text; the other three targets are uuid, so the shape is checked
    // per kind rather than accepting any string.
    if ((rawKind === "USER" && targetId.length > 200) || (rawKind !== "USER" && !UUID_PATTERN.test(targetId))) {
      throw new IdentityError("VALIDATION_ERROR", "target_id is not a valid id");
    }
    const details =
      typeof bodyRecord(body).details === "string" && String(bodyRecord(body).details).trim()
        ? String(bodyRecord(body).details).trim()
        : undefined;

    const report = await this.reports.create({
      reporterUserId: acting.account.id,
      targetKind: rawKind,
      targetId,
      reason: rawReason,
      ...(details ? { details } : {}),
      requestId: request.requestId,
    });
    return reportPayload(report);
  }
}
