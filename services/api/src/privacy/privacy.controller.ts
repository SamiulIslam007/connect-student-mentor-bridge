import { Body, Controller, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";

import { RATE_LIMITS } from "@connect/config";
import { IdentityError, type IdentityService } from "@connect/domain";

import { bearerToken } from "../http/bearer.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import { PRIVACY_SERVICE } from "./privacy.tokens.js";
import type { PrivacyService } from "./privacy.service.js";

function confirmEmailField(body: unknown): string {
  const value =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>).confirm_email : undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new IdentityError("VALIDATION_ERROR", "confirm_email is required");
  }
  return value;
}

/**
 * `POST /v1/privacy/*` (docs/api-contracts.md §5.8). Both routes act on the
 * caller's own record only; the account id comes from the session, never the body.
 */
@Controller("v1/privacy")
export class PrivacyController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(PRIVACY_SERVICE) private readonly privacy: PrivacyService,
  ) {}

  @Throttle({ default: RATE_LIMITS.export })
  @Post("export")
  @HttpCode(200)
  async export(
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const account = await this.identity.getSession({ sessionToken: bearerToken(request) });
    if (!account) {
      throw new IdentityError("SESSION_INVALID", "the session is not valid");
    }
    // A suspended, deleted, or deactivated account may not run a bulk read.
    if (account.accountStatus !== "ACTIVE") {
      throw new IdentityError("FORBIDDEN", "this account cannot export its data");
    }

    const document = await this.privacy.exportAccount({
      userId: account.id,
      requestId: request.requestId,
    });

    // The document is personal data: never cached, always an attachment (SEC-DATA).
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Disposition", 'attachment; filename="connect-export.json"');
    return document as unknown as Record<string, unknown>;
  }

  @Throttle({ default: RATE_LIMITS.write })
  @Post("delete")
  @HttpCode(200)
  async delete(@Body() body: unknown, @Req() request: RequestWithId): Promise<{ status: string }> {
    const account = await this.identity.getSession({ sessionToken: bearerToken(request) });
    if (!account) {
      throw new IdentityError("SESSION_INVALID", "the session is not valid");
    }

    const result = await this.privacy.deleteAccount({
      userId: account.id,
      confirmEmail: confirmEmailField(body),
      requestId: request.requestId,
    });
    return { status: result.status };
  }
}
