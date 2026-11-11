import { Module, type Provider } from "@nestjs/common";

import { IdentityModule } from "../identity/identity.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { PROFILES_SERVICE } from "../profiles/profiles.tokens.js";
import type { ProfilesService } from "../profiles/profiles.service.js";
import { DrizzleMatchingService } from "./drizzle-matching.service.js";
import { MatchingController } from "./matching.controller.js";
import { MATCHING_SERVICE } from "./matching.tokens.js";

const matchingServiceProvider: Provider = {
  provide: MATCHING_SERVICE,
  inject: [PROFILES_SERVICE],
  useFactory: (profiles: ProfilesService): DrizzleMatchingService =>
    new DrizzleMatchingService(profiles),
};

/**
 * The matching module owns suggestion reads only. It reads the pool through
 * `ProfilesService`, so capacity and eligibility keep one definition (R2).
 */
@Module({
  imports: [IdentityModule, ProfilesModule],
  controllers: [MatchingController],
  providers: [matchingServiceProvider],
})
export class MatchingModule {}
