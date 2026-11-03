import { Body, Controller, Get, Inject, Put, Req } from "@nestjs/common";

import {
  IdentityError,
  type AccountSummary,
  type IdentityService,
  type MentorProfileDraft,
  type StudentProfileDraft,
} from "@connect/domain";

import { bearerToken } from "../http/bearer.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import type {
  FieldSummary,
  ProfilesService,
} from "./profiles.service.js";
import { mentorProfilePayload, studentProfilePayload } from "./profiles.service.js";
import { PROFILES_SERVICE } from "./profiles.tokens.js";

function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

/** A missing or non-string value reads as empty, so validation owns the refusal. */
function textOf(body: unknown, field: string): string {
  const value = bodyRecord(body)[field];
  return typeof value === "string" ? value : "";
}

/** Absent reads as empty; a present non-array is a request error before any write. */
function stringArrayOf(body: unknown, field: string): string[] {
  const value = bodyRecord(body)[field];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every((entry): entry is string => typeof entry === "string")) {
    throw new IdentityError("VALIDATION_ERROR", `${field} must be an array of strings`);
  }
  return value;
}

function readStudentDraft(body: unknown): StudentProfileDraft {
  return {
    goals: textOf(body, "goals"),
    primaryField: textOf(body, "primary_field"),
    interestFields: stringArrayOf(body, "interest_fields"),
    languages: stringArrayOf(body, "languages"),
  };
}

function readMentorDraft(body: unknown): MentorProfileDraft {
  return {
    headline: textOf(body, "headline"),
    bio: textOf(body, "bio"),
    expertiseSummary: textOf(body, "expertise_summary"),
    scopeStatement: textOf(body, "scope_statement"),
    primaryField: textOf(body, "primary_field"),
    additionalFields: stringArrayOf(body, "fields"),
    languages: stringArrayOf(body, "languages"),
    weeklyCapacity: bodyRecord(body).weekly_capacity,
  };
}

/**
 * Profile saving (docs/api-contracts.md §5.1) and the field taxonomy.
 *
 * The acting user always comes from the session. Account-level properties in the
 * body (`account_status`, `display_name`, `email`, `user_id`) are read by name and
 * therefore ignored rather than rejected, matching `auth.controller.ts` (D5).
 */
@Controller("v1")
export class ProfilesController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(PROFILES_SERVICE) private readonly profiles: ProfilesService,
  ) {}

  @Put("me/student-profile")
  async saveStudentProfile(
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const account = await this.actingAccount(request);
    const saved = await this.profiles.saveStudentProfile({
      userId: account.id,
      draft: readStudentDraft(body),
    });
    return studentProfilePayload(saved);
  }

  @Put("me/mentor-profile")
  async saveMentorProfile(
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const account = await this.actingAccount(request);
    const saved = await this.profiles.saveMentorProfile({
      userId: account.id,
      draft: readMentorDraft(body),
    });
    return mentorProfilePayload(saved);
  }

  @Get("fields")
  async fields(@Req() request: RequestWithId): Promise<{ fields: FieldSummary[] }> {
    await this.actingAccount(request);
    return { fields: await this.profiles.listFields() };
  }

  /**
   * No `account_status` check is repeated here on purpose: the account-status
   * lifecycle guarantees that only an `ACTIVE` account holds a session
   * (activation on verification; suspension and deactivation delete every
   * session row in the same transaction). A valid session therefore already
   * implies `ACTIVE`. Do not "fix" this with a redundant status check.
   */
  private async actingAccount(request: RequestWithId): Promise<AccountSummary> {
    const account = await this.identity.getSession({
      sessionToken: bearerToken(request),
    });
    if (!account) {
      throw new IdentityError("SESSION_INVALID", "the session is not valid");
    }
    return account;
  }
}
