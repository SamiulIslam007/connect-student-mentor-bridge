import { Body, Controller, Get, Inject, Put, Query, Req } from "@nestjs/common";

import {
  IdentityError,
  type AvailabilityContext,
  type AvailabilityWindowDraft,
  type IdentityService,
} from "@connect/domain";

import { actingAccountWithRoles } from "../authorization/authorize.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import { availabilityPayload, type AvailabilityService } from "./availability.service.js";
import { AVAILABILITY_SERVICE } from "./availability.tokens.js";

function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

function readContext(value: unknown): AvailabilityContext {
  if (value === "STUDENT" || value === "MENTOR") {
    return value;
  }
  throw new IdentityError("VALIDATION_ERROR", "context must be STUDENT or MENTOR");
}

/** Absent windows is an empty set; a non-array is a request error. */
function readWindows(value: unknown): AvailabilityWindowDraft[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new IdentityError("VALIDATION_ERROR", "windows must be an array");
  }
  return value.map((entry) => {
    const window = bodyRecord(entry);
    return {
      weekday: window.weekday,
      startMinute: window.start_minute,
      endMinute: window.end_minute,
      timezone: window.timezone,
    };
  });
}

/**
 * `GET` and `PUT /v1/me/availability` (docs/api-contracts.md §5.2).
 *
 * The user always comes from the session. The mentor context needs the `MENTOR`
 * role (4c's guard); the student context needs only a session.
 */
@Controller("v1/me/availability")
export class AvailabilityController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(AVAILABILITY_SERVICE) private readonly availability: AvailabilityService,
  ) {}

  @Get()
  async read(@Query("context") context: unknown, @Req() request: RequestWithId) {
    // Authentication comes first, so an anonymous caller is refused with 401
    // rather than a body-level 422.
    const acting = await actingAccountWithRoles(this.identity, request);
    const parsed = readContext(context);
    if (parsed === "MENTOR" && !acting.roles.includes("MENTOR")) {
      throw new IdentityError("ROLE_REQUIRED", "this action requires the mentor role");
    }
    const windows = await this.availability.read({ userId: acting.account.id, context: parsed });
    return { context: parsed, windows: availabilityPayload(windows) };
  }

  @Put()
  async replace(@Body() body: unknown, @Req() request: RequestWithId) {
    const acting = await actingAccountWithRoles(this.identity, request);
    const parsed = readContext(bodyRecord(body).context);
    if (parsed === "MENTOR" && !acting.roles.includes("MENTOR")) {
      throw new IdentityError("ROLE_REQUIRED", "this action requires the mentor role");
    }
    const windows = readWindows(bodyRecord(body).windows);

    const saved = await this.availability.replace({
      userId: acting.account.id,
      context: parsed,
      windows,
    });
    return { context: parsed, windows: availabilityPayload(saved) };
  }
}
