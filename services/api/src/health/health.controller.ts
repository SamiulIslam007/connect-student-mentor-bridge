import { Controller, Get, Inject, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";

import { READINESS_TIMEOUT_MS } from "@connect/config";
import type { HealthResponse, ReadinessResponse } from "@connect/contracts";

import { resolveDatabaseUrl } from "../db/database-url.js";
import { probeDatabase, type DatabaseProbe } from "./database-probe.js";

/** Injection token for the readiness check (explicit, no reflection needed). */
export const DATABASE_PROBE = "DATABASE_PROBE";

/**
 * Resolve the URL the same way the database module does (environment, then the
 * repository-root `.env`), so readiness reports the database the API actually
 * uses. A missing configuration is `unavailable`, never a thrown 500 (design D13).
 */
export function createDefaultProbe(resolveUrl: () => string = () => resolveDatabaseUrl()): DatabaseProbe {
  return () => {
    let url: string;
    try {
      url = resolveUrl();
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "readiness.database_failed",
          message: error instanceof Error ? error.message : "the database configuration is unreadable",
        }),
      );
      return Promise.resolve("unavailable");
    }
    return probeDatabase(url, { timeoutMs: READINESS_TIMEOUT_MS });
  };
}

export const defaultProbe: DatabaseProbe = createDefaultProbe();

/**
 * Operational endpoints (docs/api-contracts.md section 1, SEC-INF-8).
 * Unversioned, unauthenticated, and stable in shape.
 */
// The plain @SkipThrottle() marks only the `default` bucket; a named skip is
// required once a second throttler exists (D-118, verified in throttler 6.7.1).
@SkipThrottle({ default: true, account: true })
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
