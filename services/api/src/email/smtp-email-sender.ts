import { createTransport, type Transporter } from "nodemailer";

import type { EmailMessage, EmailSender } from "./email-sender.js";

export class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly transporter: Transporter,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}

/** Mailpit locally; the same settings point at a provider in deployment. */
export function createSmtpEmailSender(environment: NodeJS.ProcessEnv = process.env): EmailSender {
  const transporter = createTransport({
    host: environment.SMTP_HOST ?? "localhost",
    port: Number(environment.SMTP_PORT ?? 1025),
    secure: false,
    auth:
      environment.SMTP_USER && environment.SMTP_PASSWORD
        ? { user: environment.SMTP_USER, pass: environment.SMTP_PASSWORD }
        : undefined,
  });

  return new SmtpEmailSender(transporter, environment.SMTP_FROM ?? "no-reply@connect.local");
}
