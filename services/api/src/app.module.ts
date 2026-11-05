import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { AvailabilityController } from "./availability/availability.controller.js";
import { AvailabilityModule } from "./availability/availability.module.js";
import { DatabaseModule } from "./db/database.module.js";
import { DATABASE_PROBE, defaultProbe, HealthController } from "./health/health.controller.js";
import { RequestIdMiddleware } from "./http/request-id.middleware.js";
import { ProblemDetailsFilter } from "./http/problem-details.filter.js";
import { AuthController } from "./identity/auth.controller.js";
import { IdentityModule } from "./identity/identity.module.js";
import { MeController } from "./me/me.controller.js";
import { MeModule } from "./me/me.module.js";
import { MeRolesController } from "./me/roles.controller.js";
import { ProfilesController } from "./profiles/profiles.controller.js";
import { ProfilesModule } from "./profiles/profiles.module.js";

/**
 * Modular monolith root module. Product modules (matching, requests, outcomes,
 * reputation, notifications, admin, audit) are added by later changes.
 */
@Module({
  imports: [DatabaseModule, IdentityModule, MeModule, ProfilesModule, AvailabilityModule],
  controllers: [HealthController],
  providers: [
    { provide: DATABASE_PROBE, useValue: defaultProbe },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(
        HealthController,
        AuthController,
        MeController,
        MeRolesController,
        ProfilesController,
        AvailabilityController,
      );
  }
}
