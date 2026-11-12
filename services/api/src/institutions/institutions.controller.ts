import { Body, Controller, Get, Inject, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { RATE_LIMITS } from "@connect/config";
import type { IdentityService } from "@connect/domain";

import { requireRole } from "../authorization/authorize.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import {
  institutionPayload,
  type InstitutionsService,
} from "./institutions.service.js";
import { INSTITUTIONS_SERVICE } from "./institutions.tokens.js";

function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
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
  async list(@Req() request: RequestWithId): Promise<{ data: Record<string, unknown>[] }> {
    await requireRole(this.identity, request, "PLATFORM_ADMIN", { requiresMfa: true });
    const rows = await this.institutions.listInstitutions();
    return { data: rows.map(institutionPayload) };
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
