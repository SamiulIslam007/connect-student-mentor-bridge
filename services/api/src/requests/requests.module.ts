import { Module, type Provider } from "@nestjs/common";

import { DATABASE, DatabaseModule } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { IdentityModule } from "../identity/identity.module.js";
import { DrizzleRequestsService } from "./drizzle-requests.service.js";
import { RequestsController } from "./requests.controller.js";
import { REQUESTS_SERVICE } from "./requests.tokens.js";

const requestsServiceProvider: Provider = {
  provide: REQUESTS_SERVICE,
  inject: [DATABASE],
  useFactory: (database: Database): DrizzleRequestsService => new DrizzleRequestsService(database),
};

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [RequestsController],
  providers: [requestsServiceProvider],
  exports: [REQUESTS_SERVICE],
})
export class RequestsModule {}
