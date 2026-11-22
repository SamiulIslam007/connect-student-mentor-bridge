import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { RATE_LIMITS } from "@connect/config";
import { IdentityError, type IdentityService } from "@connect/domain";

import { actingAccountWithRoles } from "../authorization/authorize.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { EVIDENCE_CONTENT_TYPES } from "../http/request-body.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import { evidencePayload, type EvidenceService } from "./evidence.service.js";
import { EVIDENCE_SERVICE } from "./evidence.tokens.js";

function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null && !Buffer.isBuffer(body)
    ? (body as Record<string, unknown>)
    : {};
}

/**
 * Outcome evidence (docs/api-contracts.md §5.6, FR-OUT-02). The two documented
 * upload routes plus the read that mints a short-lived link; the service resolves
 * every object-level rule (design R1).
 */
@Controller("v1/outcomes")
export class EvidenceController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(EVIDENCE_SERVICE) private readonly evidence: EvidenceService,
  ) {}

  @Throttle({ default: RATE_LIMITS.write })
  @Post(":id/evidence")
  @HttpCode(201)
  async createIntent(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await actingAccountWithRoles(this.identity, request);
    const input = bodyRecord(body);
    const record = await this.evidence.createIntent({
      userId: acting.account.id,
      outcomeId: id,
      contentType: typeof input.content_type === "string" ? input.content_type : undefined,
      sizeBytes: typeof input.size_bytes === "number" ? input.size_bytes : undefined,
      sha256: typeof input.sha256 === "string" ? input.sha256 : undefined,
      requestId: request.requestId,
    });
    return evidencePayload({ record, url: null });
  }

  @Throttle({ default: RATE_LIMITS.write })
  @Post(":id/evidence/:evidence_id/complete")
  @HttpCode(200)
  async completeUpload(
    @Param("id") id: string,
    @Param("evidence_id") evidenceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await actingAccountWithRoles(this.identity, request);
    if (!Buffer.isBuffer(body)) {
      throw new IdentityError("VALIDATION_ERROR", "the body must be the file bytes");
    }
    const contentType = String(request.headers["content-type"] ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase();
    if (!(EVIDENCE_CONTENT_TYPES as readonly string[]).includes(contentType ?? "")) {
      throw new IdentityError(
        "VALIDATION_ERROR",
        `content-type must be one of ${EVIDENCE_CONTENT_TYPES.join(", ")}`,
      );
    }
    const record = await this.evidence.completeUpload({
      userId: acting.account.id,
      outcomeId: id,
      evidenceId,
      bytes: body,
      requestId: request.requestId,
    });
    return evidencePayload({ record, url: null });
  }

  @Get(":id/evidence/:evidence_id")
  async read(
    @Param("id") id: string,
    @Param("evidence_id") evidenceId: string,
    @Headers("x-access-reason") accessReason: string | undefined,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await actingAccountWithRoles(this.identity, request);
    const link = await this.evidence.read({
      userId: acting.account.id,
      roles: acting.roles,
      adminWithMfa: acting.account.mfaEnabled,
      outcomeId: id,
      evidenceId,
      reason: accessReason,
      requestId: request.requestId,
    });
    return evidencePayload(link);
  }
}
