import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";

import {
  IdentityError,
  REQUEST_STATUSES,
  type IdentityService,
  type RequestStatus,
} from "@connect/domain";

import type { RequestWithId } from "../http/request-id.middleware.js";
import { actingAccountWithRoles, requireRole } from "../authorization/authorize.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import { requestPayload, type RequestsService } from "./requests.service.js";
import { REQUESTS_SERVICE } from "./requests.tokens.js";

const TIMEFRAMES = [
  "WITHIN_1_MONTH",
  "ONE_TO_3_MONTHS",
  "THREE_TO_6_MONTHS",
  "OVER_6_MONTHS",
] as const;
const INTERACTIONS = ["ASYNC_THREAD", "ONE_TO_ONE_SESSION", "GROUP_OFFICE_HOURS"] as const;

function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

function textOf(body: unknown, field: string): string | undefined {
  const value = bodyRecord(body)[field];
  return typeof value === "string" ? value : undefined;
}

function timeframeOf(value: unknown): (typeof TIMEFRAMES)[number] {
  if (typeof value === "string" && (TIMEFRAMES as readonly string[]).includes(value)) {
    return value as (typeof TIMEFRAMES)[number];
  }
  throw new IdentityError(
    "VALIDATION_ERROR",
    `expected_timeframe must be one of ${TIMEFRAMES.join(", ")}`,
  );
}

function interactionOf(value: unknown): (typeof INTERACTIONS)[number] {
  if (value === undefined) {
    return "ASYNC_THREAD";
  }
  if (typeof value === "string" && (INTERACTIONS as readonly string[]).includes(value)) {
    return value as (typeof INTERACTIONS)[number];
  }
  throw new IdentityError(
    "VALIDATION_ERROR",
    `interaction_type must be one of ${INTERACTIONS.join(", ")}`,
  );
}

function statusOf(value: unknown): RequestStatus | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string" && (REQUEST_STATUSES as readonly string[]).includes(value.toUpperCase())) {
    return value.toUpperCase() as RequestStatus;
  }
  throw new IdentityError("VALIDATION_ERROR", "status is not a known request status");
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

/**
 * Request lifecycle (docs/api-contracts.md §5.4). Creation is a student action,
 * a decision is the addressee's, and withdrawal is the sender's; the acting
 * account always comes from the session.
 */
@Controller("v1/requests")
export class RequestsController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(REQUESTS_SERVICE) private readonly requests: RequestsService,
  ) {}

  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown, @Req() request: RequestWithId): Promise<Record<string, unknown>> {
    const acting = await requireRole(this.identity, request, "STUDENT");
    const created = await this.requests.create({
      userId: acting.account.id,
      mentorProfileId: textOf(body, "mentor_id") ?? "",
      question: textOf(body, "question") ?? "",
      contextSummary: textOf(body, "context_summary") ?? "",
      targetOutcome: textOf(body, "target_outcome") ?? "",
      timeframe: timeframeOf(bodyRecord(body).expected_timeframe),
      interactionType: interactionOf(bodyRecord(body).interaction_type),
      applicationNote: textOf(body, "application_note"),
      requestId: request.requestId,
    });
    return requestPayload(created);
  }

  @Get()
  async list(
    @Query("role") role: unknown,
    @Query("status") status: unknown,
    @Query("cursor") cursor: unknown,
    @Query("limit") limit: unknown,
    @Req() request: RequestWithId,
  ): Promise<{ data: Record<string, unknown>[]; next_cursor: string | null }> {
    const acting = await actingAccountWithRoles(this.identity, request);
    if (!acting.roles.includes("STUDENT") && !acting.roles.includes("MENTOR")) {
      throw new IdentityError("ROLE_REQUIRED", "this action requires the student or mentor role");
    }

    const roleValue = firstQueryValue(role) ?? "sent";
    if (roleValue !== "sent" && roleValue !== "received") {
      throw new IdentityError("VALIDATION_ERROR", "role must be sent or received");
    }
    const limitValue = firstQueryValue(limit);
    const parsedLimit = limitValue === undefined ? 20 : Number(limitValue);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      throw new IdentityError("VALIDATION_ERROR", "limit must be a whole number from 1 to 50");
    }

    const page = await this.requests.list({
      userId: acting.account.id,
      role: roleValue,
      status: statusOf(firstQueryValue(status)),
      cursor: firstQueryValue(cursor),
      limit: parsedLimit,
    });
    return { data: page.requests.map(requestPayload), next_cursor: page.nextCursor };
  }

  @Get(":id")
  async read(@Param("id") id: string, @Req() request: RequestWithId): Promise<Record<string, unknown>> {
    const acting = await actingAccountWithRoles(this.identity, request);
    return requestPayload(await this.requests.read(acting.account.id, id));
  }

  @Post(":id/accept")
  @HttpCode(200)
  async accept(@Param("id") id: string, @Req() request: RequestWithId): Promise<Record<string, unknown>> {
    const acting = await requireRole(this.identity, request, "MENTOR");
    const decided = await this.requests.decide({
      userId: acting.account.id,
      requestId: id,
      action: "accept",
      requestIdHeader: request.requestId,
    });
    return requestPayload(decided);
  }

  @Post(":id/decline")
  @HttpCode(200)
  async decline(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await requireRole(this.identity, request, "MENTOR");
    const decided = await this.requests.decide({
      userId: acting.account.id,
      requestId: id,
      action: "decline",
      note: textOf(body, "reason"),
      requestIdHeader: request.requestId,
    });
    return requestPayload(decided);
  }

  @Post(":id/withdraw")
  @HttpCode(200)
  async withdraw(@Param("id") id: string, @Req() request: RequestWithId): Promise<Record<string, unknown>> {
    const acting = await requireRole(this.identity, request, "STUDENT");
    const withdrawn = await this.requests.withdraw({
      userId: acting.account.id,
      requestId: id,
      requestIdHeader: request.requestId,
    });
    return requestPayload(withdrawn);
  }
}
