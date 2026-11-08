import { Module, type Provider } from "@nestjs/common";

import { DATABASE, DatabaseModule } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { IdentityModule } from "../identity/identity.module.js";
import { DrizzleReputationService } from "./drizzle-reputation.service.js";
import { ReputationController } from "./reputation.controller.js";
import { REPUTATION_SERVICE } from "./reputation.tokens.js";

const reputationServiceProvider: Provider = {
  provide: REPUTATION_SERVICE,
  inject: [DATABASE],
  useFactory: (database: Database): DrizzleReputationService =>
    new DrizzleReputationService(database),
};

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [ReputationController],
  providers: [reputationServiceProvider],
  exports: [REPUTATION_SERVICE],
})
export class ReputationModule {}
