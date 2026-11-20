import { Module, type Provider } from "@nestjs/common";

import { DATABASE, DatabaseModule } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { IdentityModule } from "../identity/identity.module.js";
import { AttestationController } from "./attestation.controller.js";
import { ATTESTATIONS_SERVICE } from "./attestation.tokens.js";
import type { AttestationsService } from "./attestations.service.js";
import { DrizzleAttestationsService } from "./drizzle-attestation.service.js";
import { DrizzleInstitutionDashboardService } from "./drizzle-institution-dashboard.service.js";
import { DrizzleInstitutionsService } from "./drizzle-institutions.service.js";
import { InstitutionDashboardController } from "./institution-dashboard.controller.js";
import {
  INSTITUTION_DASHBOARD_SERVICE,
  type InstitutionDashboardService,
} from "./institution-dashboard.service.js";
import { InstitutionsController } from "./institutions.controller.js";
import { INSTITUTIONS_SERVICE } from "./institutions.tokens.js";
import type { InstitutionsService } from "./institutions.service.js";

const attestationsServiceProvider: Provider = {
  provide: ATTESTATIONS_SERVICE,
  inject: [DATABASE],
  useFactory: (database: Database): AttestationsService =>
    new DrizzleAttestationsService(database),
};

/** Institution-scoped affiliation decisions, the platform-admin grant, onboarding and the aggregate read. */
@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [AttestationController, InstitutionsController, InstitutionDashboardController],
  providers: [
    attestationsServiceProvider,
    {
      provide: INSTITUTIONS_SERVICE,
      inject: [DATABASE],
      useFactory: (database: Database): InstitutionsService =>
        new DrizzleInstitutionsService(database),
    },
    {
      provide: INSTITUTION_DASHBOARD_SERVICE,
      inject: [DATABASE],
      useFactory: (database: Database): InstitutionDashboardService =>
        new DrizzleInstitutionDashboardService(database),
    },
  ],
})
export class InstitutionsModule {}
