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
export interface SmtpTlsPolicy {
  /** Implicit TLS, which the provider's port 465 expects. */
  secure: boolean;
  /** STARTTLS is mandatory: a provider that cannot offer it is a failure, not a downgrade. */
  requireTLS: boolean;
}

/**
 * SEC-AUDIT-014 (D-261): TLS is required in production. Local Mailpit stays
 * plaintext by explicit development configuration, never because production
 * forgot the setting.
 */
export function smtpTlsPolicy(environment: NodeJS.ProcessEnv = process.env): SmtpTlsPolicy {
  const port = Number(environment.SMTP_PORT ?? 1025);
  if (environment.NODE_ENV !== "production") {
    return { secure: false, requireTLS: false };
  }
  return { secure: port === 465, requireTLS: true };
}

export function createSmtpEmailSender(environment: NodeJS.ProcessEnv = process.env): EmailSender {
  const tls = smtpTlsPolicy(environment);
  const transporter = createTransport({
    host: environment.SMTP_HOST ?? "localhost",
    port: Number(environment.SMTP_PORT ?? 1025),
    secure: tls.secure,
    requireTLS: tls.requireTLS,
    auth:
      environment.SMTP_USER && environment.SMTP_PASSWORD
        ? { user: environment.SMTP_USER, pass: environment.SMTP_PASSWORD }
        : undefined,
  });

  return new SmtpEmailSender(transporter, environment.SMTP_FROM ?? "no-reply@connect.local");
}
