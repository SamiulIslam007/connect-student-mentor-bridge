import { Module, type Provider } from "@nestjs/common";

import { DATABASE, DatabaseModule } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { IdentityModule } from "../identity/identity.module.js";
import { DrizzleReportsService } from "./drizzle-reports.service.js";
import { ReportsAdminController } from "./admin.controller.js";
import { ReportsController } from "./reports.controller.js";
import { REPORTS_SERVICE } from "./reports.tokens.js";

const reportsServiceProvider: Provider = {
  provide: REPORTS_SERVICE,
  inject: [DATABASE],
  useFactory: (database: Database): DrizzleReportsService => new DrizzleReportsService(database),
};

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [ReportsController, ReportsAdminController],
  providers: [reportsServiceProvider],
  exports: [REPORTS_SERVICE],
})
export class ReportsModule {}
