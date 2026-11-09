import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { RATE_LIMITS } from "@connect/config";

import {
  IdentityError,
  OUTCOME_STATUSES,
  isReviewDecision,
  type IdentityService,
  type OutcomeStatus,
} from "@connect/domain";

import { actingAccountWithRoles, requireRole } from "../authorization/authorize.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import { outcomePayload, type OutcomeService } from "./outcome.service.js";
import { OUTCOME_SERVICE } from "./outcomes.tokens.js";

function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

function textOf(body: unknown, field: string): string | undefined {
  const value = bodyRecord(body)[field];
  return typeof value === "string" ? value : undefined;
}

function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}

function statusOf(value: unknown): OutcomeStatus | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string" && (OUTCOME_STATUSES as readonly string[]).includes(value.toUpperCase())) {
    return value.toUpperCase() as OutcomeStatus;
  }
  throw new IdentityError("VALIDATION_ERROR", "status is not a known outcome status");
}

function limitOf(value: unknown): number {
  const raw = firstQueryValue(value);
  const parsed = raw === undefined ? 20 : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new IdentityError("VALIDATION_ERROR", "limit must be a whole number from 1 to 50");
  }
  return parsed;
}

/**
 * Outcomes (docs/api-contracts.md §5.6). Reporting is the student's, confirming
 * and disputing are the mentor's, withdrawing is the reporter's; a non-participant
 * gets `404` on every route (design D8).
 */
@Controller("v1/outcomes")
export class OutcomesController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(OUTCOME_SERVICE) private readonly outcomes: OutcomeService,
  ) {}

  @Throttle({ default: RATE_LIMITS.write })
  @Post()
  @HttpCode(201)
  async report(@Body() body: unknown, @Req() request: RequestWithId): Promise<Record<string, unknown>> {
    const acting = await actingAccountWithRoles(this.identity, request);
    const created = await this.outcomes.report({
      userId: acting.account.id,
      mentorshipId: textOf(body, "mentorship_id") ?? "",
      outcomeType: textOf(body, "outcome_type"),
      title: textOf(body, "title"),
      description: textOf(body, "description"),
      contributionClaimed: textOf(body, "contribution_claimed"),
      occurredOn: textOf(body, "occurred_on"),
      requestId: request.requestId,
    });
    return outcomePayload(created);
  }

  @Get()
  async list(
    @Query("mentorship_id") mentorshipId: unknown,
    @Query("status") status: unknown,
    @Query("limit") limit: unknown,
    @Req() request: RequestWithId,
  ): Promise<{ data: Record<string, unknown>[] }> {
    const acting = await actingAccountWithRoles(this.identity, request);
    const rows = await this.outcomes.list({
      userId: acting.account.id,
      mentorshipId: firstQueryValue(mentorshipId),
      status: statusOf(firstQueryValue(status)),
      limit: limitOf(limit),
    });
    return { data: rows.map(outcomePayload) };
  }

  @Get(":id")
  async read(@Param("id") id: string, @Req() request: RequestWithId): Promise<Record<string, unknown>> {
    const acting = await actingAccountWithRoles(this.identity, request);
    return outcomePayload(await this.outcomes.read(acting.account.id, id));
  }

  @Throttle({ default: RATE_LIMITS.write })
  @Post(":id/confirm")
  @HttpCode(200)
  async confirm(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await actingAccountWithRoles(this.identity, request);
    const confirmed = await this.outcomes.confirm({
      userId: acting.account.id,
      outcomeId: id,
      contributionLevel: textOf(body, "contribution_level_confirmed"),
      coiDeclaration: bodyRecord(body).coi_declaration,
      requestId: request.requestId,
    });
    return outcomePayload(confirmed);
  }

  @Throttle({ default: RATE_LIMITS.write })
  @Post(":id/dispute")
  @HttpCode(200)
  async dispute(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await actingAccountWithRoles(this.identity, request);
    const disputed = await this.outcomes.dispute({
      userId: acting.account.id,
      outcomeId: id,
      reason: textOf(body, "reason"),
      requestId: request.requestId,
    });
    return outcomePayload(disputed);
  }

  /** The only exit from `IN_PLATFORM_REVIEW` (and the T11 clawback). */
  @Post(":id/review")
  @HttpCode(200)
  async review(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await requireRole(this.identity, request, "PLATFORM_ADMIN", {
      requiresMfa: true,
    });
    const decision = textOf(body, "decision");
    if (!decision || !isReviewDecision(decision)) {
      throw new IdentityError("VALIDATION_ERROR", "decision must be valid or invalid");
    }
    const reviewed = await this.outcomes.review({
      userId: acting.account.id,
      outcomeId: id,
      decision,
      reason: textOf(body, "reason") ?? "",
      requestId: request.requestId,
    });
    return outcomePayload(reviewed);
  }

  @Post(":id/withdraw")
  @HttpCode(200)
  async withdraw(@Param("id") id: string, @Req() request: RequestWithId): Promise<Record<string, unknown>> {
    const acting = await actingAccountWithRoles(this.identity, request);
    return outcomePayload(
      await this.outcomes.withdraw(acting.account.id, id, request.requestId),
    );
  }
}
