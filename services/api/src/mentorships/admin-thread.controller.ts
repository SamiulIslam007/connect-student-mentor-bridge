import { Body, Controller, HttpCode, Inject, Param, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";

import { RATE_LIMITS } from "@connect/config";
import type { IdentityService } from "@connect/domain";

import { requireRole } from "../authorization/authorize.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import { messagePayload, sessionPayload, type MentorshipService } from "./mentorship.service.js";
import { MENTORSHIP_SERVICE } from "./mentorships.tokens.js";

function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

/**
 * The audited break-glass read (docs/api-contracts.md §5.5, D-120 to D-124).
 * Its own controller, so the participant routes can never inherit this guard
 * and this route can never inherit theirs (design R4).
 */
@Controller("v1")
export class AdminThreadController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(MENTORSHIP_SERVICE) private readonly mentorships: MentorshipService,
  ) {}

  @Throttle({ default: RATE_LIMITS.write })
  @Post("admin/mentorships/:id/break-glass-read")
  @HttpCode(200)
  async breakGlass(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const acting = await requireRole(this.identity, request, "PLATFORM_ADMIN", {
      requiresMfa: true,
    });

    // The service validates the reason, resolves the mentorship, writes the
    // audit row, and only then reads (D-121).
    const thread = await this.mentorships.breakGlassRead({
      mentorshipId: id,
      actorUserId: acting.account.id,
      reason: bodyRecord(body).reason,
      requestId: request.requestId,
    });

    response.setHeader("Cache-Control", "no-store");
    return {
      mentorship_id: thread.mentorship.id,
      status: thread.mentorship.status.toLowerCase(),
      agreement: {
        cadence: thread.mentorship.cadence?.toLowerCase() ?? null,
        planned_weeks: thread.mentorship.plannedWeeks,
        goal: thread.mentorship.goal,
        student_acknowledged_at: thread.mentorship.studentAckAt,
        mentor_acknowledged_at: thread.mentorship.mentorAckAt,
        agreement_acknowledged:
          thread.mentorship.studentAckAt !== null && thread.mentorship.mentorAckAt !== null,
        started_at: thread.mentorship.startedAt,
        ended_at: thread.mentorship.endedAt,
      },
      messages: thread.messages.map(messagePayload),
      sessions: thread.sessions.map(sessionPayload),
    };
  }
}
