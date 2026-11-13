import { Module, type Provider } from "@nestjs/common";

import { DATABASE, DatabaseModule } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { IdentityModule } from "../identity/identity.module.js";
import { AuditController } from "./audit.controller.js";
import { AUDIT_SERVICE } from "./audit.tokens.js";
import { DrizzleAuditService } from "./drizzle-audit.service.js";

const auditServiceProvider: Provider = {
  provide: AUDIT_SERVICE,
  inject: [DATABASE],
  useFactory: (database: Database): DrizzleAuditService => new DrizzleAuditService(database),
};

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [AuditController],
  providers: [auditServiceProvider],
  exports: [AUDIT_SERVICE],
})
export class AuditModule {}
