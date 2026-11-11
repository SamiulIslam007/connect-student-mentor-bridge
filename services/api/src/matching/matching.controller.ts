import { Controller, Get, Inject, Req } from "@nestjs/common";

import type { IdentityService } from "@connect/domain";

import { requireRole } from "../authorization/authorize.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import { MATCHING_SERVICE } from "./matching.tokens.js";
import type { MatchingService } from "./matching.service.js";

/**
 * `GET /v1/suggestions` (docs/api-contracts.md §5.3). Student-only, five
 * mentors, no cursor: the set size is fixed (design R1, R3).
 */
@Controller("v1")
export class MatchingController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(MATCHING_SERVICE) private readonly matching: MatchingService,
  ) {}

  @Get("suggestions")
  async suggestions(@Req() request: RequestWithId): Promise<{ data: Record<string, unknown>[] }> {
    const acting = await requireRole(this.identity, request, "STUDENT");
    return { data: await this.matching.suggest({ userId: acting.account.id }) };
  }
}
