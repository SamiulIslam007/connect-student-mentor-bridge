import { Controller, Get, Header, Inject, Query, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { RATE_LIMITS } from "@connect/config";
import type { IdentityService } from "@connect/domain";

import { requireScopedInstitution } from "../authorization/authorize.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import {
  INSTITUTION_DASHBOARD_SERVICE,
  institutionAggregatesPayload,
  type InstitutionDashboardService,
} from "./institution-dashboard.service.js";

/**
 * The `FR-INST-02` aggregate read (docs/api-contracts.md §5.7): one institution,
 * integers only, counts below the floor of five withheld. No page ships with
 * this change (D-214), and the read writes no audit row because it changes
 * nothing and discloses no personal data (the `D-137` precedent).
 */
@Controller("v1")
export class InstitutionDashboardController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(INSTITUTION_DASHBOARD_SERVICE)
    private readonly dashboard: InstitutionDashboardService,
  ) {}

  @Get("institution/aggregates")
  @Header("Cache-Control", "no-store")
  @Throttle({ default: RATE_LIMITS.default })
  async aggregates(
    @Query("institution_id") institutionId: unknown,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await requireScopedInstitution(this.identity, request, institutionId);
    const counts = await this.dashboard.aggregates(acting.institutionId);
    return institutionAggregatesPayload(acting.institutionId, counts);
  }
}
