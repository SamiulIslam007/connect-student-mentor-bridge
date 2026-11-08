import { Module, type Provider } from "@nestjs/common";

import { DATABASE, DatabaseModule } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { IdentityModule } from "../identity/identity.module.js";
import { DrizzleOutcomeService } from "./drizzle-outcome.service.js";
import { OutcomesController } from "./outcomes.controller.js";
import { OUTCOME_SERVICE } from "./outcomes.tokens.js";

const outcomeServiceProvider: Provider = {
  provide: OUTCOME_SERVICE,
  inject: [DATABASE],
  useFactory: (database: Database): DrizzleOutcomeService => new DrizzleOutcomeService(database),
};

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [OutcomesController],
  providers: [outcomeServiceProvider],
  exports: [OUTCOME_SERVICE],
})
export class OutcomesModule {}
