import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { Response } from "express";

import { READINESS_TIMEOUT_MS } from "@connect/config";
import type { HealthResponse, ReadinessResponse } from "@connect/contracts";

import { probeDatabase, type DatabaseProbe } from "./database-probe.js";

/** Injection token for the readiness check (explicit, no reflection needed). */
export const DATABASE_PROBE = "DATABASE_PROBE";

export const defaultProbe: DatabaseProbe = () =>
  probeDatabase(process.env.DATABASE_URL, { timeoutMs: READINESS_TIMEOUT_MS });

/**
 * Operational endpoints (docs/api-contracts.md section 1, SEC-INF-8).
 * Unversioned, unauthenticated, and stable in shape.
 */
@Controller()
export class HealthController {
  constructor(@Inject(DATABASE_PROBE) private readonly probe: DatabaseProbe) {}

  @Get("healthz")
  healthz(): HealthResponse {
    return { status: "ok", service: "api" };
  }

  @Get("readyz")
  async readyz(@Res({ passthrough: true }) response: Response): Promise<ReadinessResponse> {
    const database = await this.probe();

    if (database !== "ok") {
      response.status(503);
      return { status: "unavailable", checks: { database } };
    }

    return { status: "ok", checks: { database } };
  }
}
