import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { RATE_LIMITS } from "@connect/config";

import { AvailabilityController } from "./availability/availability.controller.js";
import { AvailabilityModule } from "./availability/availability.module.js";
import { AffiliationsController } from "./affiliations/affiliations.controller.js";
import { AffiliationsModule } from "./affiliations/affiliations.module.js";
import { DATABASE, DatabaseModule } from "./db/database.module.js";
import type { Database } from "./db/database.js";
import { DATABASE_PROBE, defaultProbe, HealthController } from "./health/health.controller.js";
import { accountTracker } from "./http/account-throttler.js";
import { RequestIdMiddleware } from "./http/request-id.middleware.js";
import { ProblemDetailsFilter } from "./http/problem-details.filter.js";
import { BodyAllowlistInterceptor } from "./http/body-allowlist.interceptor.js";
import { AuthController } from "./identity/auth.controller.js";
import { IdentityModule } from "./identity/identity.module.js";
import { AttestationController } from "./institutions/attestation.controller.js";
import { InstitutionsModule } from "./institutions/institutions.module.js";
import { MeController } from "./me/me.controller.js";
import { MentorshipsController, SessionsController } from "./mentorships/mentorships.controller.js";
import { MentorshipsModule } from "./mentorships/mentorships.module.js";
import { OutcomesController } from "./outcomes/outcomes.controller.js";
import { ReviewQueueController } from "./outcomes/review-queue.controller.js";
import { OutcomesModule } from "./outcomes/outcomes.module.js";
import { ReputationController } from "./reputation/reputation.controller.js";
import { ReputationModule } from "./reputation/reputation.module.js";
import { MeModule } from "./me/me.module.js";
import { MeRolesController } from "./me/roles.controller.js";
import { MatchingController } from "./matching/matching.controller.js";
import { MatchingModule } from "./matching/matching.module.js";
import { PrivacyController } from "./privacy/privacy.controller.js";
import { ReportsAdminController } from "./reports/admin.controller.js";
import { ReportsController } from "./reports/reports.controller.js";
import { ReportsModule } from "./reports/reports.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { ConsentModule } from "./consent/consent.module.js";
import { PrivacyModule } from "./privacy/privacy.module.js";
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
      // The per-account bucket (D-118). Module-level default is permissive; only
      // the credential routes override it with @Throttle({ account: ... }).
      {
        name: "account",
        ttl: RATE_LIMITS.accountDefault.ttl,
        limit: RATE_LIMITS.accountDefault.limit,
        getTracker: accountTracker,
      },
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
    ConsentModule,
    PrivacyModule,
    ReportsModule,
    AuditModule,
    MatchingModule,
    InstitutionsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: DATABASE_PROBE, useValue: defaultProbe },
    {
      provide: APP_FILTER,
      inject: [DATABASE],
      // The filter records a refusal on a sensitive action, so it needs the log's
      // database; a bare instance writes nothing (D-152).
      useFactory: (database: Database) => new ProblemDetailsFilter(database),
    },
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
        ReviewQueueController,
        ReputationController,
        PrivacyController,
        ReportsController,
        ReportsAdminController,
        MatchingController,
        AttestationController,
      );
  }
}
