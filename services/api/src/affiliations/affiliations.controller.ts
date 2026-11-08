import { Body, Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";

import { IdentityError, type AccountSummary, type IdentityService } from "@connect/domain";

import { bearerToken } from "../http/bearer.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import { affiliationPayload, type AffiliationsService } from "./affiliations.service.js";
import { AFFILIATIONS_SERVICE } from "./affiliations.tokens.js";

function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

/** Absent reads as undefined so the service's validation owns every refusal. */
function textOf(body: unknown, field: string): string | undefined {
  const value = bodyRecord(body)[field];
  return typeof value === "string" ? value : undefined;
}

/**
 * `POST /v1/me/affiliations` (docs/api-contracts.md §5.2). The acting account
 * always comes from the session; `user_id`, `nid`, and `passport_number` in the
 * body are read by name and therefore ignored.
 */
@Controller("v1/me")
export class AffiliationsController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(AFFILIATIONS_SERVICE) private readonly affiliations: AffiliationsService,
  ) {}

  @Post("affiliations")
  @HttpCode(200)
  async claim(@Body() body: unknown, @Req() request: RequestWithId): Promise<Record<string, unknown>> {
    const account = await this.actingAccount(request);
    const result = await this.affiliations.claim({
      userId: account.id,
      institutionId: textOf(body, "institution_id"),
      kind: textOf(body, "kind") as never,
      department: textOf(body, "department"),
      program: textOf(body, "program"),
      batchYear: bodyRecord(body).batch_year as number | undefined,
      requestId: request.requestId,
    });
    return {
      affiliation: affiliationPayload(result.affiliation),
      level: result.affiliation.level.toLowerCase(),
    };
  }

  private async actingAccount(request: RequestWithId): Promise<AccountSummary> {
    const account = await this.identity.getSession({ sessionToken: bearerToken(request) });
    if (!account) {
      throw new IdentityError("SESSION_INVALID", "the session is not valid");
    }
    return account;
  }
}
