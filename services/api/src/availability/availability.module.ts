import { Module, type Provider } from "@nestjs/common";

import { DATABASE, DatabaseModule } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { IdentityModule } from "../identity/identity.module.js";
import { AvailabilityController } from "./availability.controller.js";
import { AVAILABILITY_SERVICE } from "./availability.tokens.js";
import { DrizzleAvailabilityService } from "./drizzle-availability.service.js";

const availabilityServiceProvider: Provider = {
  provide: AVAILABILITY_SERVICE,
  inject: [DATABASE],
  useFactory: (database: Database): DrizzleAvailabilityService =>
    new DrizzleAvailabilityService(database),
};

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [AvailabilityController],
  providers: [availabilityServiceProvider],
  exports: [AVAILABILITY_SERVICE],
})
export class AvailabilityModule {}
