import { Controller, Get, Inject, Query, Req } from "@nestjs/common";

import { IdentityError, type IdentityService } from "@connect/domain";

import { requireRole } from "../authorization/authorize.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import { reviewCasePayload, type OutcomeService } from "./outcome.service.js";
import { OUTCOME_SERVICE } from "./outcomes.tokens.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `GET /v1/review-queue` (docs/api-contracts.md §5.9): open platform-review
 * cases for a Platform Admin with an enrolled second factor. Its own route so
 * the participant-scoped outcome list never gains a second authorization model
 * (design D1).
 */
@Controller("v1/review-queue")
export class ReviewQueueController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(OUTCOME_SERVICE) private readonly outcomes: OutcomeService,
  ) {}

  @Get()
  async list(
    @Query("cursor") cursor: unknown,
    @Query("limit") limit: unknown,
    @Req() request: RequestWithId,
  ): Promise<{ data: Record<string, unknown>[]; next_cursor: string | null }> {
    await requireRole(this.identity, request, "PLATFORM_ADMIN", { requiresMfa: true });

    const rawCursor = typeof cursor === "string" ? cursor.trim() : "";
    if (rawCursor && !UUID_PATTERN.test(rawCursor)) {
      throw new IdentityError("VALIDATION_ERROR", "cursor is not an outcome id");
    }
    const rawLimit = typeof limit === "string" ? limit : "";
    const parsed = rawLimit === "" ? 20 : Number(rawLimit);
    if (!/^\d*$/.test(rawLimit) || !Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
      throw new IdentityError("VALIDATION_ERROR", "limit must be a whole number from 1 to 50");
    }

    const page = await this.outcomes.reviewQueue({
      limit: parsed,
      ...(rawCursor ? { cursor: rawCursor } : {}),
    });
    return { data: page.cases.map(reviewCasePayload), next_cursor: page.nextCursor };
  }
}
