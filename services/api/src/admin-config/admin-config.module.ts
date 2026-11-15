import { Module, type Provider } from "@nestjs/common";

import { DATABASE, DatabaseModule } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { IdentityModule } from "../identity/identity.module.js";
import { AdminConfigController } from "./config.controller.js";
import { CONFIG_SERVICE } from "./config.tokens.js";
import { DrizzleConfigService } from "./drizzle-config.service.js";

const configServiceProvider: Provider = {
  provide: CONFIG_SERVICE,
  inject: [DATABASE],
  useFactory: (database: Database): DrizzleConfigService => new DrizzleConfigService(database),
};

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [AdminConfigController],
  providers: [configServiceProvider],
  exports: [CONFIG_SERVICE],
})
export class AdminConfigModule {}
