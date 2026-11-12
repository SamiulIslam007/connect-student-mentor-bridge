import { Controller, Get, Inject, Param, Req } from "@nestjs/common";

import { IdentityError, type IdentityService } from "@connect/domain";

import { actingAccountWithRoles } from "../authorization/authorize.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import type {
  ImpactReport,
  OwnImpactReport,
  ReputationService,
} from "./drizzle-reputation.service.js";
import { REPUTATION_SERVICE } from "./reputation.tokens.js";

/**
 * Counts-only impact reads (docs/api-contracts.md §5.3). The payload carries no
 * score, points, tier, or ranking, and never a student id, name, or outcome text
 * (design D8).
 */
function payload(report: ImpactReport): Record<string, unknown> {
  return {
    data: report.rows.map((row) => ({
      field_id: row.fieldId,
      field_name: row.fieldName,
      outcome_type: row.outcomeType,
      count: row.count,
    })),
    counted_outcomes: report.countedOutcomes,
  };
}

/**
 * The own read adds the two request counts (D-115). Built as its own payload so
 * the public route's key set cannot drift into it.
 */
function ownPayload(report: OwnImpactReport): Record<string, unknown> {
  return {
    ...payload(report),
    requests_decided_in_time: report.requestsDecidedInTime,
    requests_late_or_expired: report.requestsLateOrExpired,
  };
}

@Controller("v1")
export class ReputationController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(REPUTATION_SERVICE) private readonly reputation: ReputationService,
  ) {}

  @Get("me/impact")
  async ownImpact(@Req() request: RequestWithId): Promise<Record<string, unknown>> {
    const acting = await actingAccountWithRoles(this.identity, request);
    return ownPayload(await this.reputation.impactForUser(acting.account.id));
  }

  @Get("mentors/:id/impact")
  async mentorImpact(
    @Param("id") id: string,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    await actingAccountWithRoles(this.identity, request);
    const report = await this.reputation.impactForMentorProfile(id);
    if (!report) {
      throw new IdentityError("SESSION_NOT_FOUND", "the mentor does not exist");
    }
    return payload(report);
  }
}
