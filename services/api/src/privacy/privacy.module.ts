import { Module, type Provider } from "@nestjs/common";

import { DATABASE, DatabaseModule } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { IdentityModule } from "../identity/identity.module.js";
import { readIdentityConfig } from "../identity/identity.config.js";
import { DrizzlePrivacyService } from "./drizzle-privacy.service.js";
import { PrivacyController } from "./privacy.controller.js";
import { PRIVACY_SERVICE } from "./privacy.tokens.js";

const privacyServiceProvider: Provider = {
  provide: PRIVACY_SERVICE,
  inject: [DATABASE],
  useFactory: (database: Database): DrizzlePrivacyService =>
    new DrizzlePrivacyService({ database, secret: readIdentityConfig().secret }),
};

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [PrivacyController],
  providers: [privacyServiceProvider],
  exports: [PRIVACY_SERVICE],
})
export class PrivacyModule {}
