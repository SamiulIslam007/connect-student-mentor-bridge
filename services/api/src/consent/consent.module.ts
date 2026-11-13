import { Module, type Provider } from "@nestjs/common";

import { DATABASE, DatabaseModule } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { IdentityModule } from "../identity/identity.module.js";
import { ConsentController } from "./consent.controller.js";
import { CONSENT_SERVICE } from "./consent.tokens.js";
import { DrizzleConsentService } from "./drizzle-consent.service.js";

const consentServiceProvider: Provider = {
  provide: CONSENT_SERVICE,
  inject: [DATABASE],
  useFactory: (database: Database): DrizzleConsentService => new DrizzleConsentService(database),
};

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [ConsentController],
  providers: [consentServiceProvider],
  exports: [CONSENT_SERVICE],
})
export class ConsentModule {}
