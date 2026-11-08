import { Module, type Provider } from "@nestjs/common";

import { DATABASE, DatabaseModule } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { IdentityModule } from "../identity/identity.module.js";
import { DrizzleMentorshipService } from "./drizzle-mentorship.service.js";
import { MentorshipsController, SessionsController } from "./mentorships.controller.js";
import { MENTORSHIP_SERVICE } from "./mentorships.tokens.js";

const mentorshipServiceProvider: Provider = {
  provide: MENTORSHIP_SERVICE,
  inject: [DATABASE],
  useFactory: (database: Database): DrizzleMentorshipService =>
    new DrizzleMentorshipService(database),
};

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [MentorshipsController, SessionsController],
  providers: [mentorshipServiceProvider],
  exports: [MENTORSHIP_SERVICE],
})
export class MentorshipsModule {}
