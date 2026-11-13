import { Body, Controller, Get, HttpCode, Inject, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { RATE_LIMITS } from "@connect/config";
import { IdentityError, type IdentityService } from "@connect/domain";

import { bearerToken } from "../http/bearer.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import { CONSENT_SERVICE } from "./consent.tokens.js";
import type { ConsentService } from "./consent.service.js";

/** The global allowlist interceptor already refuses an undocumented key. */
function fields(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

/**
 * `GET` and `POST /v1/me/consents` (docs/api-contracts.md §5.9). Both act on the
 * caller's own record: the account id comes from the session, never the body.
 * No route refuses a stale document version (design R3).
 */
@Controller("v1/me/consents")
export class ConsentController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(CONSENT_SERVICE) private readonly consents: ConsentService,
  ) {}

  @Throttle({ default: RATE_LIMITS.write })
  @Get()
  async read(@Req() request: RequestWithId) {
    const account = await this.identity.getSession({ sessionToken: bearerToken(request) });
    if (!account) {
      throw new IdentityError("SESSION_INVALID", "the session is not valid");
    }
    return this.consents.read(account.id);
  }

  @Throttle({ default: RATE_LIMITS.write })
  @Post()
  @HttpCode(200)
  async record(@Body() body: unknown, @Req() request: RequestWithId) {
    const account = await this.identity.getSession({ sessionToken: bearerToken(request) });
    if (!account) {
      throw new IdentityError("SESSION_INVALID", "the session is not valid");
    }
    const input = fields(body);
    return this.consents.record({
      userId: account.id,
      purpose: String(input.purpose ?? ""),
      action: input.action,
      documentVersion: input.document_version,
      institutionId: input.institution_id,
      requestId: request.requestId,
    });
  }
}
