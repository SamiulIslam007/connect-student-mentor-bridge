import { Module, type Provider } from "@nestjs/common";

import { DATABASE, DatabaseModule } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { createSmtpEmailSender } from "../email/smtp-email-sender.js";
import type { EmailSender } from "../email/email-sender.js";
import { AuthController } from "./auth.controller.js";
import { createIdentityAuth, type IdentityAuth } from "./better-auth.js";
import { BetterAuthIdentityService } from "./better-auth-identity.service.js";
import { readIdentityConfig, type IdentityConfig } from "./identity.config.js";
import {
  PASSWORD_BREACH_CHECKER,
  createPwnedPasswordsChecker,
  type PasswordBreachChecker,
} from "./password-breach.js";
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
      google: config.google,
    });
  },
};

const breachCheckerProvider: Provider = {
  provide: PASSWORD_BREACH_CHECKER,
  useFactory: (): PasswordBreachChecker => createPwnedPasswordsChecker(),
};

const identityServiceProvider: Provider = {
  provide: IDENTITY_SERVICE,
  inject: [IDENTITY_AUTH, DATABASE, PASSWORD_BREACH_CHECKER],
  useFactory: (auth: IdentityAuth, database: Database, breachChecker: PasswordBreachChecker): BetterAuthIdentityService => {
    const config = readIdentityConfig();
    return new BetterAuthIdentityService({
      auth,
      database,
      secret: config.secret,
      providerIds: config.google ? ["google"] : [],
      breachChecker,
    });
  },
};

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [emailSenderProvider, breachCheckerProvider, authProvider, identityServiceProvider],
  exports: [IDENTITY_SERVICE],
})
export class IdentityModule {}
