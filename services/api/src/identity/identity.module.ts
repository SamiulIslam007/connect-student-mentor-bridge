import { Module, type Provider } from "@nestjs/common";

import { DATABASE, DatabaseModule } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { createSmtpEmailSender } from "../email/smtp-email-sender.js";
import type { EmailSender } from "../email/email-sender.js";
import { AuthController } from "./auth.controller.js";
import { createIdentityAuth, type IdentityAuth } from "./better-auth.js";
import { BetterAuthIdentityService } from "./better-auth-identity.service.js";
import { readIdentityConfig, type IdentityConfig } from "./identity.config.js";
import { EMAIL_SENDER, IDENTITY_AUTH, IDENTITY_SERVICE } from "./identity.tokens.js";

const emailSenderProvider: Provider = {
  provide: EMAIL_SENDER,
  useFactory: (): EmailSender => createSmtpEmailSender(),
};

const authProvider: Provider = {
  provide: IDENTITY_AUTH,
  inject: [DATABASE, EMAIL_SENDER],
  useFactory: (database: Database, emailSender: EmailSender): IdentityAuth => {
    const config: IdentityConfig = readIdentityConfig();
    return createIdentityAuth({
      database,
      emailSender,
      secret: config.secret,
      baseUrl: config.baseUrl,
    });
  },
};

const identityServiceProvider: Provider = {
  provide: IDENTITY_SERVICE,
  inject: [IDENTITY_AUTH, DATABASE],
  useFactory: (auth: IdentityAuth, database: Database): BetterAuthIdentityService =>
    new BetterAuthIdentityService({
      auth,
      database,
      secret: readIdentityConfig().secret,
    }),
};

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [emailSenderProvider, authProvider, identityServiceProvider],
  exports: [IDENTITY_SERVICE],
})
export class IdentityModule {}
