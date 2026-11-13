import { Controller, Get, Inject, Query, Req } from "@nestjs/common";

import { IdentityError, type IdentityService } from "@connect/domain";

import { requireRole } from "../authorization/authorize.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import { AUDIT_ACTIONS, AUDIT_OBJECT_TYPES, type AuditService } from "./audit.service.js";
import { AUDIT_SERVICE } from "./audit.tokens.js";
import { decodeCursor } from "./drizzle-audit.service.js";

/** Account ids are the library's text ids, not uuids; object ids are free text. */
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function optionalText(value: unknown, name: string, maxLength: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new IdentityError("VALIDATION_ERROR", `${name} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }
  if (trimmed.length > maxLength) {
    throw new IdentityError("VALIDATION_ERROR", `${name} is longer than ${maxLength} characters`);
  }
  return trimmed;
}

/** `YYYY-MM-DD` at 00:00 UTC, or at 23:59:59.999 UTC for the upper bound. */
function dayBound(value: string, name: string, endOfDay: boolean): Date {
  if (!DATE_PATTERN.test(value)) {
    throw new IdentityError("VALIDATION_ERROR", `${name} must be a calendar date (YYYY-MM-DD)`);
  }
  const start = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== value) {
    throw new IdentityError("VALIDATION_ERROR", `${name} is not a real date`);
  }
  return endOfDay ? new Date(start.getTime() + 86_400_000 - 1) : start;
}

function payload(row: {
  id: string;
  occurredAt: Date;
  actorUserId: string | null;
  actorRole: string;
  action: string;
  objectType: string;
  objectId: string | null;
  requestId: string;
  breakGlass: boolean;
  reason: string | null;
}): Record<string, unknown> {
  return {
    id: row.id,
    occurred_at: row.occurredAt.toISOString(),
    actor_user_id: row.actorUserId,
    actor_role: row.actorRole,
    action: row.action,
    object_type: row.objectType,
    object_id: row.objectId,
    request_id: row.requestId,
    break_glass: row.breakGlass,
    reason: row.reason,
  };
}

/**
 * `GET /v1/admin/audit` (docs/api-contracts.md §5.10): the reviewer's read over
 * the append-only log. `PLATFORM_ADMIN` plus an enrolled second factor, keyset
 * paginated, and the read itself writes nothing (design R4).
 */
@Controller("v1/admin")
export class AuditController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
  ) {}

  @Get("audit")
  async list(
    @Query("actor") actor: unknown,
    @Query("action") action: unknown,
    @Query("object_type") objectType: unknown,
    @Query("object_id") objectId: unknown,
    @Query("from") from: unknown,
    @Query("to") to: unknown,
    @Query("cursor") cursor: unknown,
    @Query("limit") limit: unknown,
    @Req() request: RequestWithId,
  ): Promise<{ data: Record<string, unknown>[]; next_cursor: string | null }> {
    await requireRole(this.identity, request, "PLATFORM_ADMIN", { requiresMfa: true });

    const rawActor = optionalText(actor, "actor", 64);
    if (rawActor !== undefined && !ACCOUNT_ID_PATTERN.test(rawActor)) {
      throw new IdentityError("VALIDATION_ERROR", "actor must be an account id");
    }
    const rawAction = optionalText(action, "action", 64);
    if (rawAction !== undefined && !(AUDIT_ACTIONS as readonly string[]).includes(rawAction)) {
      throw new IdentityError("VALIDATION_ERROR", "action is not a known audit action");
    }
    const rawObjectType = optionalText(objectType, "object_type", 64);
    if (
      rawObjectType !== undefined &&
      !(AUDIT_OBJECT_TYPES as readonly string[]).includes(rawObjectType)
    ) {
      throw new IdentityError("VALIDATION_ERROR", "object_type is not a known object type");
    }
    const rawObjectId = optionalText(objectId, "object_id", 128);
    const rawFrom = optionalText(from, "from", 10);
    const rawTo = optionalText(to, "to", 10);
    const fromDate = rawFrom === undefined ? undefined : dayBound(rawFrom, "from", false);
    const toDate = rawTo === undefined ? undefined : dayBound(rawTo, "to", true);
    if (fromDate !== undefined && toDate !== undefined && fromDate.getTime() > toDate.getTime()) {
      throw new IdentityError("VALIDATION_ERROR", "from must not be later than to");
    }

    const rawLimit = typeof limit === "string" ? limit.trim() : "";
    const parsedLimit = rawLimit === "" ? 50 : Number(rawLimit);
    if (
      (rawLimit !== "" && !/^\d+$/.test(rawLimit)) ||
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > 100
    ) {
      throw new IdentityError("VALIDATION_ERROR", "limit must be a whole number from 1 to 100");
    }

    const rawCursor = optionalText(cursor, "cursor", 128);
    if (rawCursor !== undefined && decodeCursor(rawCursor) === null) {
      throw new IdentityError("VALIDATION_ERROR", "cursor is not a valid page cursor");
    }

    const page = await this.audit.list({
      limit: parsedLimit,
      ...(rawCursor === undefined ? {} : { cursor: rawCursor }),
      filters: {
        ...(rawActor === undefined ? {} : { actorId: rawActor }),
        ...(rawAction === undefined ? {} : { action: rawAction }),
        ...(rawObjectType === undefined ? {} : { objectType: rawObjectType }),
        ...(rawObjectId === undefined ? {} : { objectId: rawObjectId }),
        ...(fromDate === undefined ? {} : { from: fromDate }),
        ...(toDate === undefined ? {} : { to: toDate }),
      },
    });
    return { data: page.rows.map(payload), next_cursor: page.nextCursor };
  }
}
