import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { RATE_LIMITS } from "@connect/config";
import { IdentityError, type IdentityService } from "@connect/domain";

import { requireInstitutionAdmin, requireRole } from "../authorization/authorize.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import {
  decidedClaimPayload,
  pendingClaimPayload,
  type AttestationsService,
  type ClaimDecision,
} from "./attestations.service.js";
import { ATTESTATIONS_SERVICE } from "./attestation.tokens.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

function textOf(body: unknown, field: string): string {
  const value = bodyRecord(body)[field];
  return typeof value === "string" ? value : "";
}

function uuidParam(value: string, field: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new IdentityError("VALIDATION_ERROR", `${field} must be a uuid`);
  }
  return value;
}

/**
 * The institution attestation surface (docs/api-contracts.md §5.2). The scope
 * comes from `requireInstitutionAdmin`, never from the request (D-98); the one
 * `/v1/admin` addition is the grant, which only a platform admin can make.
 */
@Controller("v1")
export class AttestationController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(ATTESTATIONS_SERVICE) private readonly attestations: AttestationsService,
  ) {}

  @Get("institution/affiliations")
  async queue(@Req() request: RequestWithId): Promise<{ data: Record<string, unknown>[] }> {
    const acting = await requireInstitutionAdmin(this.identity, request);
    const claims = await this.attestations.listPendingClaims(acting.institutionIds);
    return { data: claims.map(pendingClaimPayload) };
  }

  @Post("institution/affiliations/:id/decide")
  @HttpCode(200)
  @Throttle({ default: RATE_LIMITS.write })
  async decide(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await requireInstitutionAdmin(this.identity, request);
    const claim = await this.attestations.decideClaim({
      claimId: uuidParam(id, "id"),
      actorUserId: acting.account.id,
      institutionIds: acting.institutionIds,
      decision: (textOf(body, "decision") || undefined) as ClaimDecision,
      reason: textOf(body, "reason"),
      requestId: request.requestId,
    });
    return decidedClaimPayload(claim);
  }

  @Post("admin/institutions/:id/admins")
  @HttpCode(200)
  @Throttle({ default: RATE_LIMITS.write })
  async grantInstitutionAdmin(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<{ roles: string[] }> {
    const institutionId = uuidParam(id, "id");
    const acting = await requireRole(this.identity, request, "PLATFORM_ADMIN", {
      requiresMfa: true,
    });
    const targetUserId = await this.attestations.resolveGrantTarget({
      institutionId,
      email: textOf(body, "email"),
    });
    const roles = await this.identity.grantRole({
      userId: targetUserId,
      role: "INSTITUTION_ADMIN",
      institutionId,
      actorUserId: acting.account.id,
      requestId: request.requestId,
    });
    return { roles };
  }
}
