import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query, Req } from "@nestjs/common";

import {
  IdentityError,
  type AccountSummary,
  type IdentityService,
  type MentorAccessModeChoice,
  type MentorProfileDraft,
  type StudentProfileDraft,
} from "@connect/domain";

import { bearerToken } from "../http/bearer.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { requireRole } from "../authorization/authorize.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import type {
  FieldSummary,
  ListMentorsInput,
  MentorAccessState,
  ProfilesService,
} from "./profiles.service.js";
import {
  mentorContextPayload,
  mentorDirectoryPayload,
  mentorProfilePayload,
  studentProfilePayload,
} from "./profiles.service.js";
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

/** Absent leaves the stored mode alone; `PAUSED` is not a save-time choice. */
function readAccessMode(value: unknown): MentorAccessModeChoice | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "OPEN" || value === "APPLICATION_ONLY") {
    return value;
  }
  throw new IdentityError("VALIDATION_ERROR", "access_mode must be OPEN or APPLICATION_ONLY");
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
    accessMode: readAccessMode(bodyRecord(body).access_mode),
  };
}

const MENTOR_DIRECTORY_DEFAULT_LIMIT = 20;
const MENTOR_DIRECTORY_MAX_LIMIT = 50;
const MENTOR_ACCESS_STATES: readonly MentorAccessState[] = [
  "available",
  "application_only",
  "full",
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every directory filter is validated here, so a bad value never reaches SQL (design D3). */
function mentorDirectoryQuery(
  fieldValue: unknown,
  languageValue: unknown,
  accessStateValue: unknown,
  cursorValue: unknown,
  limitValue: unknown,
): ListMentorsInput {
  const field = firstQueryValue(fieldValue)?.trim();
  if (field !== undefined && field !== "" && !UUID_PATTERN.test(field)) {
    throw new IdentityError("VALIDATION_ERROR", "field must be a field id");
  }

  const language = firstQueryValue(languageValue)?.trim();

  const rawState = firstQueryValue(accessStateValue)?.trim();
  let accessState: MentorAccessState | undefined;
  if (rawState !== undefined && rawState !== "") {
    if (!MENTOR_ACCESS_STATES.includes(rawState as MentorAccessState)) {
      throw new IdentityError(
        "VALIDATION_ERROR",
        "access_state must be available, application_only, or full",
      );
    }
    accessState = rawState as MentorAccessState;
  }

  const cursor = firstQueryValue(cursorValue)?.trim();
  if (cursor !== undefined && cursor !== "" && !UUID_PATTERN.test(cursor)) {
    throw new IdentityError("VALIDATION_ERROR", "cursor is not a mentor profile id");
  }

  const rawLimit = firstQueryValue(limitValue);
  let limit = MENTOR_DIRECTORY_DEFAULT_LIMIT;
  if (rawLimit !== undefined) {
    if (!/^\d+$/.test(rawLimit)) {
      throw new IdentityError(
        "VALIDATION_ERROR",
        `limit must be a whole number from 1 to ${MENTOR_DIRECTORY_MAX_LIMIT}`,
      );
    }
    limit = Number(rawLimit);
    if (limit < 1 || limit > MENTOR_DIRECTORY_MAX_LIMIT) {
      throw new IdentityError(
        "VALIDATION_ERROR",
        `limit must be a whole number from 1 to ${MENTOR_DIRECTORY_MAX_LIMIT}`,
      );
    }
  }

  return {
    ...(field ? { field } : {}),
    ...(language ? { language } : {}),
    ...(accessState ? { accessState } : {}),
    ...(cursor ? { cursor } : {}),
    limit,
  };
}

/** The taxonomy page size (FR-PROF-01, design D9). */
const DEFAULT_FIELD_PAGE_SIZE = 100;
const MAX_FIELD_PAGE_SIZE = 200;
const MAX_CURSOR_LENGTH = 100;

/** Express can hand back an array or an object for a repeated/structured query key. */
function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}

/** `limit` is validated here, so an invalid page size is a 422 before any query. */
function fieldPageQuery(
  limitValue: unknown,
  cursorValue: unknown,
): { limit: number; cursor?: string } {
  const rawLimit = firstQueryValue(limitValue);
  let limit = DEFAULT_FIELD_PAGE_SIZE;
  if (rawLimit !== undefined) {
    if (!/^\d+$/.test(rawLimit)) {
      throw new IdentityError(
        "VALIDATION_ERROR",
        `limit must be a whole number from 1 to ${MAX_FIELD_PAGE_SIZE}`,
      );
    }
    limit = Number(rawLimit);
    if (limit < 1 || limit > MAX_FIELD_PAGE_SIZE) {
      throw new IdentityError(
        "VALIDATION_ERROR",
        `limit must be a whole number from 1 to ${MAX_FIELD_PAGE_SIZE}`,
      );
    }
  }
  const cursor = firstQueryValue(cursorValue)?.trim();
  if (!cursor) {
    return { limit };
  }
  if (cursor.length > MAX_CURSOR_LENGTH) {
    throw new IdentityError("VALIDATION_ERROR", "cursor is not a valid field slug");
  }
  return { limit, cursor };
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
    // Not MFA-gated in this change: #5 owns the first MFA-required mentor action,
    // and gating the save would lock a new mentor out of their own form (design D6).
    const acting = await requireRole(this.identity, request, "MENTOR");
    const saved = await this.profiles.saveMentorProfile({
      userId: acting.account.id,
      draft: readMentorDraft(body),
    });
    return mentorProfilePayload(saved);
  }

  /** Pause keeps the profile and only hides it from discovery (design D4). */
  @Post("me/mentor-profile/pause")
  @HttpCode(200)
  async pauseMentorProfile(@Req() request: RequestWithId): Promise<Record<string, unknown>> {
    const acting = await requireRole(this.identity, request, "MENTOR");
    const saved = await this.profiles.setMentorAccessMode({
      userId: acting.account.id,
      accessMode: "PAUSED",
    });
    return mentorProfilePayload(saved);
  }

  /** Resume defaults to OPEN and never reports a capacity decision (design D4). */
  @Post("me/mentor-profile/resume")
  @HttpCode(200)
  async resumeMentorProfile(
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await requireRole(this.identity, request, "MENTOR");
    const saved = await this.profiles.setMentorAccessMode({
      userId: acting.account.id,
      accessMode: readAccessMode(bodyRecord(body).access_mode) ?? "OPEN",
    });
    return mentorProfilePayload(saved);
  }

  @Get("fields")
  async fields(
    @Query("limit") limit: unknown,
    @Query("cursor") cursor: unknown,
    @Req() request: RequestWithId,
  ): Promise<{ fields: FieldSummary[]; next_cursor: string | null }> {
    await this.actingAccount(request);
    const page = await this.profiles.listFields(fieldPageQuery(limit, cursor));
    return { fields: page.fields, next_cursor: page.nextCursor };
  }

  /**
   * A requestable mentor's small public shape (docs/api-contracts.md §5.3). Only
   * an ACTIVE profile is readable, so a draft or pending mentor stays invisible.
   */
  /**
   * The public mentor directory (docs/api-contracts.md §5.3). Readable without a
   * session; the request action it offers stays signed-in (D-71).
   */
  @Get("mentors")
  async mentors(
    @Query("field") field: unknown,
    @Query("language") language: unknown,
    @Query("access_state") accessState: unknown,
    @Query("cursor") cursor: unknown,
    @Query("limit") limit: unknown,
  ): Promise<{ data: Record<string, unknown>[]; next_cursor: string | null }> {
    const page = await this.profiles.listMentors(
      mentorDirectoryQuery(field, language, accessState, cursor, limit),
    );
    return { data: page.cards.map(mentorDirectoryPayload), next_cursor: page.nextCursor };
  }

  @Get("mentors/:id")
  async mentorContext(
    @Param("id") id: string,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    await this.actingAccount(request);
    const context = await this.profiles.readMentorContext(id);
    if (!context) {
      throw new IdentityError("SESSION_NOT_FOUND", "the mentor does not exist");
    }
    return mentorContextPayload(context);
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
