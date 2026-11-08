import { Module, type Provider } from "@nestjs/common";

import { DatabaseModule } from "../../db/database.module.js";
import { createSmtpEmailSender } from "../../email/smtp-email-sender.js";
import type { EmailSender } from "../../email/email-sender.js";
import { EMAIL_SENDER } from "../../identity/identity.tokens.js";
import { OutboxWorker } from "./outbox-worker.js";

const emailSenderProvider: Provider = {
  provide: EMAIL_SENDER,
  useFactory: (): EmailSender => createSmtpEmailSender(),
};

/** The worker's root module: database, email, and the outbox relay (design D5). */
@Module({
  imports: [DatabaseModule],
  providers: [emailSenderProvider, OutboxWorker],
})
export class WorkerModule {}
