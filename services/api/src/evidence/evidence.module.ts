import { Module, type Provider } from "@nestjs/common";

import { DATABASE, DatabaseModule } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { IdentityModule } from "../identity/identity.module.js";
import { DrizzleEvidenceService } from "./drizzle-evidence.service.js";
import { EvidenceController } from "./evidence.controller.js";
import { EVIDENCE_SERVICE } from "./evidence.tokens.js";

const evidenceServiceProvider: Provider = {
  provide: EVIDENCE_SERVICE,
  inject: [DATABASE],
  useFactory: (database: Database): DrizzleEvidenceService => new DrizzleEvidenceService(database),
};

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [EvidenceController],
  providers: [evidenceServiceProvider],
  exports: [EVIDENCE_SERVICE],
})
export class EvidenceModule {}
