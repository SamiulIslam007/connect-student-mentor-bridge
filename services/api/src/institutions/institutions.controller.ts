import { Body, Controller, Get, Inject, Post, Query, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { RATE_LIMITS } from "@connect/config";
import { IdentityError, type IdentityService } from "@connect/domain";

import { requireRole } from "../authorization/authorize.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import {
  INSTITUTIONS_DEFAULT_PAGE_SIZE,
  INSTITUTIONS_MAX_PAGE_SIZE,
  institutionPayload,
  type InstitutionsService,
} from "./institutions.service.js";
import { INSTITUTIONS_SERVICE } from "./institutions.tokens.js";

function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

/** `limit` is 1 to 100 and defaults to 50; anything else is a `422` (D-214). */
function parsedLimit(value: unknown): number {
  if (value === undefined) {
    return INSTITUTIONS_DEFAULT_PAGE_SIZE;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new IdentityError(
      "VALIDATION_ERROR",
      `limit must be an integer from 1 to ${INSTITUTIONS_MAX_PAGE_SIZE}`,
    );
  }
  const limit = Number(value);
  if (limit < 1 || limit > INSTITUTIONS_MAX_PAGE_SIZE) {
    throw new IdentityError(
      "VALIDATION_ERROR",
      `limit must be an integer from 1 to ${INSTITUTIONS_MAX_PAGE_SIZE}`,
    );
  }
  return limit;
}

/**
 * The platform-admin institution surface (docs/api-contracts.md §5.7). The
 * resource lives at `/v1/institutions`, not under `/v1/admin` (D-111); every
 * route needs `PLATFORM_ADMIN` with an enrolled second factor.
 */
@Controller("v1")
export class InstitutionsController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(INSTITUTIONS_SERVICE) private readonly institutions: InstitutionsService,
  ) {}

  @Get("institutions")
  async list(
    @Query("cursor") cursor: unknown,
    @Query("limit") limit: unknown,
    @Req() request: RequestWithId,
  ): Promise<{ data: Record<string, unknown>[]; next_cursor: string | null }> {
    await requireRole(this.identity, request, "PLATFORM_ADMIN", { requiresMfa: true });
    const page = await this.institutions.listInstitutions({
      cursor: cursor === undefined ? undefined : String(cursor),
      limit: parsedLimit(limit),
    });
    return { data: page.rows.map(institutionPayload), next_cursor: page.nextCursor };
  }

  @Post("institutions")
  @Throttle({ default: RATE_LIMITS.write })
  async create(
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await requireRole(this.identity, request, "PLATFORM_ADMIN", {
      requiresMfa: true,
    });
    const record = await this.institutions.createInstitution({
      name: bodyRecord(body).name,
      kind: bodyRecord(body).kind,
      countryCode: bodyRecord(body).country_code,
      mouSignedOn: bodyRecord(body).mou_signed_on,
      domains: bodyRecord(body).domains,
      actorUserId: acting.account.id,
      requestId: request.requestId,
    });
    return institutionPayload(record);
  }
}
