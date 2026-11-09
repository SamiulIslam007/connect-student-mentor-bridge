import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { RATE_LIMITS } from "@connect/config";

import { AvailabilityController } from "./availability/availability.controller.js";
import { AvailabilityModule } from "./availability/availability.module.js";
import { AffiliationsController } from "./affiliations/affiliations.controller.js";
import { AffiliationsModule } from "./affiliations/affiliations.module.js";
import { DatabaseModule } from "./db/database.module.js";
import { DATABASE_PROBE, defaultProbe, HealthController } from "./health/health.controller.js";
import { RequestIdMiddleware } from "./http/request-id.middleware.js";
import { ProblemDetailsFilter } from "./http/problem-details.filter.js";
import { BodyAllowlistInterceptor } from "./http/body-allowlist.interceptor.js";
import { AuthController } from "./identity/auth.controller.js";
import { IdentityModule } from "./identity/identity.module.js";
import { MeController } from "./me/me.controller.js";
import { MentorshipsController, SessionsController } from "./mentorships/mentorships.controller.js";
import { MentorshipsModule } from "./mentorships/mentorships.module.js";
import { OutcomesController } from "./outcomes/outcomes.controller.js";
import { OutcomesModule } from "./outcomes/outcomes.module.js";
import { ReputationController } from "./reputation/reputation.controller.js";
import { ReputationModule } from "./reputation/reputation.module.js";
import { MeModule } from "./me/me.module.js";
import { MeRolesController } from "./me/roles.controller.js";
import { ProfilesController } from "./profiles/profiles.controller.js";
import { ProfilesModule } from "./profiles/profiles.module.js";
import { RequestsController } from "./requests/requests.controller.js";
import { RequestsModule } from "./requests/requests.module.js";

/**
 * Modular monolith root module. Product modules (matching, requests, outcomes,
 * reputation, notifications, admin, audit) are added by later changes.
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: "default", ttl: RATE_LIMITS.default.ttl, limit: RATE_LIMITS.default.limit },
    ]),
    DatabaseModule,
    IdentityModule,
    MeModule,
    ProfilesModule,
    AvailabilityModule,
    AffiliationsModule,
    RequestsModule,
    MentorshipsModule,
    OutcomesModule,
    ReputationModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: DATABASE_PROBE, useValue: defaultProbe },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: BodyAllowlistInterceptor },
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
        AffiliationsController,
        RequestsController,
        MentorshipsController,
        SessionsController,
        OutcomesController,
        ReputationController,
      );
  }
}
