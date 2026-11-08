import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query, Req } from "@nestjs/common";

import {
  IdentityError,
  MENTORSHIP_STATUSES,
  type IdentityService,
  type MentorshipStatus,
} from "@connect/domain";

import { actingAccountWithRoles } from "../authorization/authorize.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import {
  mentorshipPayload,
  messagePayload,
  sessionPayload,
  type MentorshipService,
} from "./mentorship.service.js";
import { MENTORSHIP_SERVICE } from "./mentorships.tokens.js";

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

function statusOf(value: unknown): MentorshipStatus | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string" && (MENTORSHIP_STATUSES as readonly string[]).includes(value.toUpperCase())) {
    return value.toUpperCase() as MentorshipStatus;
  }
  throw new IdentityError("VALIDATION_ERROR", "status is not a known mentorship status");
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
 * Mentorship reads and actions (docs/api-contracts.md §5.5). Participation is
 * resolved in the service, so every route is a session plus a participant
 * predicate; a non-participant gets `404` (design D8).
 */
@Controller("v1/mentorships")
export class MentorshipsController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(MENTORSHIP_SERVICE) private readonly mentorships: MentorshipService,
  ) {}

  @Get()
  async list(
    @Query("status") status: unknown,
    @Query("limit") limit: unknown,
    @Req() request: RequestWithId,
  ): Promise<{ data: Record<string, unknown>[] }> {
    const acting = await actingAccountWithRoles(this.identity, request);
    const rows = await this.mentorships.list({
      userId: acting.account.id,
      status: statusOf(firstQueryValue(status)),
      limit: limitOf(limit),
    });
    return { data: rows.map(mentorshipPayload) };
  }

  @Get(":id")
  async read(@Param("id") id: string, @Req() request: RequestWithId): Promise<Record<string, unknown>> {
    const acting = await actingAccountWithRoles(this.identity, request);
    const mentorship = await this.mentorships.read(acting.account.id, id);
    // The page shows the thread, the agreement and the sessions from one read;
    // sessions have no list route of their own.
    const sessions = await this.mentorships.listSessions(acting.account.id, id);
    return { ...mentorshipPayload(mentorship), sessions: sessions.map(sessionPayload) };
  }

  @Put(":id/agreement")
  async setAgreement(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await actingAccountWithRoles(this.identity, request);
    const saved = await this.mentorships.setAgreement({
      userId: acting.account.id,
      mentorshipId: id,
      cadence: textOf(body, "cadence"),
      plannedWeeks: bodyRecord(body).planned_weeks,
      goal: textOf(body, "goal"),
    });
    return mentorshipPayload(saved);
  }

  @Post(":id/agreement/acknowledge")
  @HttpCode(200)
  async acknowledge(
    @Param("id") id: string,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await actingAccountWithRoles(this.identity, request);
    return mentorshipPayload(await this.mentorships.acknowledge(acting.account.id, id));
  }

  @Get(":id/messages")
  async listMessages(
    @Param("id") id: string,
    @Query("cursor") cursor: unknown,
    @Query("limit") limit: unknown,
    @Req() request: RequestWithId,
  ): Promise<{ data: Record<string, unknown>[]; next_cursor: string | null }> {
    const acting = await actingAccountWithRoles(this.identity, request);
    const page = await this.mentorships.listMessages({
      userId: acting.account.id,
      mentorshipId: id,
      cursor: firstQueryValue(cursor),
      limit: limitOf(limit),
    });
    return { data: page.messages.map(messagePayload), next_cursor: page.nextCursor };
  }

  @Post(":id/messages")
  @HttpCode(201)
  async postMessage(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await actingAccountWithRoles(this.identity, request);
    const created = await this.mentorships.postMessage(
      acting.account.id,
      id,
      textOf(body, "body") ?? "",
    );
    return messagePayload(created);
  }

  @Post(":id/sessions")
  @HttpCode(201)
  async createSession(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await actingAccountWithRoles(this.identity, request);
    const created = await this.mentorships.createSession({
      userId: acting.account.id,
      mentorshipId: id,
      scheduledStart: textOf(body, "scheduled_start"),
      durationMinutes: bodyRecord(body).duration_minutes,
      meetingUrl: textOf(body, "meeting_url"),
    });
    return sessionPayload(created);
  }

  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @Param("id") id: string,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await actingAccountWithRoles(this.identity, request);
    return mentorshipPayload(await this.mentorships.complete(acting.account.id, id));
  }
}

/** Session-level actions that need only the session id (docs/api-contracts.md §5.5). */
@Controller("v1/sessions")
export class SessionsController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(MENTORSHIP_SERVICE) private readonly mentorships: MentorshipService,
  ) {}

  @Post(":id/confirm-held")
  @HttpCode(200)
  async confirmHeld(
    @Param("id") id: string,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await actingAccountWithRoles(this.identity, request);
    return sessionPayload(await this.mentorships.confirmHeld(acting.account.id, id));
  }

  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await actingAccountWithRoles(this.identity, request);
    const cancelled = await this.mentorships.cancelSession({
      userId: acting.account.id,
      sessionId: id,
      reason: textOf(body, "reason"),
    });
    return sessionPayload(cancelled);
  }
}
