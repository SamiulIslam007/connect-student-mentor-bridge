import { Module, type Provider } from "@nestjs/common";

import { DATABASE, DatabaseModule } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { IdentityModule } from "../identity/identity.module.js";
import { DrizzleProfilesService } from "./drizzle-profiles.service.js";
import { ProfilesController } from "./profiles.controller.js";
import { PROFILES_SERVICE } from "./profiles.tokens.js";

const profilesServiceProvider: Provider = {
  provide: PROFILES_SERVICE,
  inject: [DATABASE],
  useFactory: (database: Database): DrizzleProfilesService =>
    new DrizzleProfilesService(database),
};

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [ProfilesController],
  providers: [profilesServiceProvider],
  exports: [PROFILES_SERVICE],
})
export class ProfilesModule {}
