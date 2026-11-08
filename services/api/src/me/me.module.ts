import { Module } from "@nestjs/common";

import { AffiliationsModule } from "../affiliations/affiliations.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { MeController } from "./me.controller.js";
import { MeRolesController } from "./roles.controller.js";

@Module({
  imports: [IdentityModule, ProfilesModule, AffiliationsModule],
  controllers: [MeController, MeRolesController],
})
export class MeModule {}
