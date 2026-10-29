import { Module } from "@nestjs/common";

import { DATABASE_PROBE, defaultProbe, HealthController } from "./health/health.controller.js";

/**
 * Modular monolith root module. Product modules (identity, profiles, matching,
 * requests, outcomes, reputation, notifications, admin, audit) are added by
 * later changes.
 */
@Module({
  controllers: [HealthController],
  providers: [{ provide: DATABASE_PROBE, useValue: defaultProbe }],
})
export class AppModule {}
