import { Controller, Get, HttpCode, Inject, Post, Req } from "@nestjs/common";

import { IdentityError, type IdentityService } from "@connect/domain";

import { bearerToken } from "../http/bearer.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";

/**
 * `GET /v1/me` and `POST /v1/me/deactivate` (docs/api-contracts.md §5.1). The
 * summary is the account record only: profile data arrives with change #4.
 */
@Controller("v1/me")
export class MeController {
  constructor(@Inject(IDENTITY_SERVICE) private readonly identity: IdentityService) {}

  @Get()
  async me(@Req() request: RequestWithId) {
    const account = await this.identity.getSession({
      sessionToken: bearerToken(request),
    });
    if (!account) {
      throw new IdentityError("SESSION_INVALID", "the session is not valid");
    }
    return {
      id: account.id,
      display_name: account.displayName,
      email: account.email,
      email_verified: account.emailVerified,
      account_status: account.accountStatus.toLowerCase(),
      timezone: account.timezone,
    };
  }

  @Post("deactivate")
  @HttpCode(200)
  async deactivate(@Req() request: RequestWithId): Promise<{ status: string }> {
    await this.identity.deactivateAccount({
      sessionToken: bearerToken(request),
      requestId: request.requestId,
    });
    return { status: "deactivated" };
  }
}
