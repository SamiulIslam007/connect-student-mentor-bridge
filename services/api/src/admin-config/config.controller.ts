import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { RATE_LIMITS } from "@connect/config";
import { CONFIG_PAYLOAD_KEYS, IdentityError, type IdentityService } from "@connect/domain";

import { requireRole } from "../authorization/authorize.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";
import { configVersionPayload, type ConfigService } from "./config.service.js";
import { CONFIG_SERVICE } from "./config.tokens.js";

function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

/**
 * `GET` and `POST /v1/admin/config` (`FR-ADM-07`, design R7). Both are a
 * Platform Admin with an enrolled second factor; the payload is validated by the
 * pure rule in the service, so a refusal names its field and writes nothing.
 * `RATE_LIMITS` is deliberately not part of the payload (AGENTS.md rule 13).
 */
@Controller("v1/admin/config")
export class AdminConfigController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(CONFIG_SERVICE) private readonly config: ConfigService,
  ) {}

  @Get()
  async read(
    @Query("cursor") cursor: unknown,
    @Query("limit") limit: unknown,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    await requireRole(this.identity, request, "PLATFORM_ADMIN", { requiresMfa: true });

    const rawCursor = typeof cursor === "string" ? cursor.trim() : "";
    const parsedCursor = rawCursor === "" ? undefined : Number(rawCursor);
    if (
      parsedCursor !== undefined &&
      (!/^\d+$/.test(rawCursor) || !Number.isInteger(parsedCursor) || parsedCursor < 1)
    ) {
      throw new IdentityError("VALIDATION_ERROR", "cursor is not a version number");
    }
    const rawLimit = typeof limit === "string" ? limit.trim() : "";
    const parsedLimit = rawLimit === "" ? 20 : Number(rawLimit);
    if (!/^\d*$/.test(rawLimit) || !Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      throw new IdentityError("VALIDATION_ERROR", "limit must be a whole number from 1 to 50");
    }

    const active = await this.config.active();
    const page = await this.config.list({
      limit: parsedLimit,
      ...(parsedCursor !== undefined ? { cursor: parsedCursor } : {}),
    });
    return {
      active: active ? configVersionPayload(active) : null,
      data: page.versions.map(configVersionPayload),
      next_cursor: page.nextCursor,
    };
  }

  @Throttle({ default: RATE_LIMITS.write })
  @Post()
  @HttpCode(201)
  async create(
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<Record<string, unknown>> {
    const acting = await requireRole(this.identity, request, "PLATFORM_ADMIN", {
      requiresMfa: true,
    });
    const record = bodyRecord(body);
    const reason = typeof record.reason === "string" ? record.reason : "";
    const payload: Record<string, unknown> = {};
    for (const key of CONFIG_PAYLOAD_KEYS) {
      payload[key] = record[key];
    }
    const created = await this.config.create({
      actorUserId: acting.account.id,
      reason,
      payload,
      requestId: request.requestId,
    });
    return configVersionPayload(created);
  }
}
