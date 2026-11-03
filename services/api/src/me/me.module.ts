import { Module } from "@nestjs/common";

import { IdentityModule } from "../identity/identity.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { MeController } from "./me.controller.js";

@Module({
  imports: [IdentityModule, ProfilesModule],
  controllers: [MeController],
})
export class MeModule {}
