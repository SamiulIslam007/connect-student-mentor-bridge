import { Module, type Provider } from "@nestjs/common";

import { DATABASE, DatabaseModule } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { IdentityModule } from "../identity/identity.module.js";
import { AttestationController } from "./attestation.controller.js";
import { ATTESTATIONS_SERVICE } from "./attestation.tokens.js";
import type { AttestationsService } from "./attestations.service.js";
import { DrizzleAttestationsService } from "./drizzle-attestation.service.js";

const attestationsServiceProvider: Provider = {
  provide: ATTESTATIONS_SERVICE,
  inject: [DATABASE],
  useFactory: (database: Database): AttestationsService =>
    new DrizzleAttestationsService(database),
};

/** Institution-scoped affiliation decisions and the platform-admin grant. */
@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [AttestationController],
  providers: [attestationsServiceProvider],
})
export class InstitutionsModule {}
