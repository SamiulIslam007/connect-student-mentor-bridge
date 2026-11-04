import { Controller, Delete, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";

import { IdentityError, type IdentityService } from "@connect/domain";

import { bearerToken } from "../http/bearer.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import {
  mentorProfilePayload,
  studentProfilePayload,
  type ProfilesService,
} from "../profiles/profiles.service.js";
import { PROFILES_SERVICE } from "../profiles/profiles.tokens.js";

/**
 * `GET /v1/me` and `POST /v1/me/deactivate` (docs/api-contracts.md §5.1).
 *
 * `MeResponse` restates the account fields and adds the caller's own profiles
 * (nullable). It is not composed from `AccountSummary`, because the sign-in
 * response must not gain profile properties (design D4).
 */
@Controller("v1/me")
export class MeController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(PROFILES_SERVICE) private readonly profiles: ProfilesService,
  ) {}

  @Get()
  async me(@Req() request: RequestWithId) {
    const account = await this.identity.getSession({
      sessionToken: bearerToken(request),
    });
    if (!account) {
      throw new IdentityError("SESSION_INVALID", "the session is not valid");
    }
    const { studentProfile, mentorProfile } = await this.profiles.readProfiles(account.id);
    return {
      id: account.id,
      display_name: account.displayName,
      email: account.email,
      email_verified: account.emailVerified,
      account_status: account.accountStatus.toLowerCase(),
      timezone: account.timezone,
      student_profile: studentProfile ? studentProfilePayload(studentProfile) : null,
      mentor_profile: mentorProfile ? mentorProfilePayload(mentorProfile) : null,
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

  /** `GET /v1/me/sessions` — safe metadata only, never a token (spec: session list). */
  @Get("sessions")
  async sessions(@Req() request: RequestWithId) {
    const rows = await this.identity.listSessions({ sessionToken: bearerToken(request) });
    return {
      data: rows.map((row) => ({
        id: row.id,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
        expires_at: row.expiresAt,
        ip_address: row.ipAddress,
        user_agent: row.userAgent,
        current: row.current,
      })),
    };
  }

  /**
   * `DELETE /v1/me/sessions/{id}` — idempotent for the caller's own ids, `404`
   * for another account's id (design D5).
   */
  @Delete("sessions/:id")
  @HttpCode(204)
  async revokeSession(
    @Param("id") id: string,
    @Req() request: RequestWithId,
  ): Promise<void> {
    await this.identity.revokeSession({
      sessionToken: bearerToken(request),
      sessionId: id,
      requestId: request.requestId,
    });
  }
}
