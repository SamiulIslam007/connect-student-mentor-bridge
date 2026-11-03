import { Module } from "@nestjs/common";

import { IdentityModule } from "../identity/identity.module.js";
import { MeController } from "./me.controller.js";

@Module({
  imports: [IdentityModule],
  controllers: [MeController],
})
export class MeModule {}
