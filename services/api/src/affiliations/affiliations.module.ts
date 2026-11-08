import { Module, type Provider } from "@nestjs/common";

import { DATABASE, DatabaseModule } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { IdentityModule } from "../identity/identity.module.js";
import { AffiliationsController } from "./affiliations.controller.js";
import { AFFILIATIONS_SERVICE } from "./affiliations.tokens.js";
import { DrizzleAffiliationsService } from "./drizzle-affiliations.service.js";

const affiliationsServiceProvider: Provider = {
  provide: AFFILIATIONS_SERVICE,
  inject: [DATABASE],
  useFactory: (database: Database): DrizzleAffiliationsService =>
    new DrizzleAffiliationsService(database),
};

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [AffiliationsController],
  providers: [affiliationsServiceProvider],
  exports: [AFFILIATIONS_SERVICE],
})
export class AffiliationsModule {}
