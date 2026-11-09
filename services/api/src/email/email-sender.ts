export type EmailTemplate =
  | "verify-email"
  | "reset-password"
  | "outbox-test"
  | "request-received"
  | "request-decided"
  | "request-expired"
  | "request-reminder"
  | "thread-message"
  | "outcome-reported"
  | "outcome-confirmed"
  | "outcome-disputed"
  | "outcome-reminder"
  | "outcome-escalated"
  | "outcome-reviewed"
  | "outcome-reversed";

export interface EmailMessage {
  to: string;
  template: EmailTemplate;
  subject: string;
  text: string;
}

/**
 * Small seam so the transport can be replaced (Mailpit locally, a provider
 * later, or an outbox writer) without touching the identity flow (design D6).
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export function verificationEmail(to: string, link: string): EmailMessage {
  return {
    to,
    template: "verify-email",
    subject: "Verify your connect email address",
    text: [
      "Confirm your email address to finish creating your connect account.",
      "",
      link,
      "",
      "The link expires in 24 hours. If you did not sign up, you can ignore this email.",
    ].join("\n"),
  };
}

export function passwordResetEmail(to: string, link: string): EmailMessage {
  return {
    to,
    template: "reset-password",
    subject: "Reset your connect password",
    text: [
      "Choose a new password for your connect account.",
      "",
      link,
      "",
      "The link expires in 30 minutes. If you did not ask for a reset, you can ignore this email.",
    ].join("\n"),
  };
}

/**
 * The library calls this from its request path; awaiting the transport would
 * leak timing information, so the send happens in the background and a failure
 * is logged with no token, password, or message body.
 */
export function sendInBackground(sender: EmailSender, message: EmailMessage): void {
  void sender.send(message).catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : "unknown error";
    console.error(
      JSON.stringify({ event: "email.send_failed", template: message.template, message: detail }),
    );
  });
}
