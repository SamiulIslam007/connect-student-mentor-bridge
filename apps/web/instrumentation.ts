/**
 * Error tracking for the web app, inert without a DSN (D-251).
 *
 * Next calls `register` once per runtime, before the app handles a request. The
 * scrub list is the shared one, so a report from the browser-side boundary and a
 * report from the API drop the same things.
 */
import { scrubEvent, type ScrubbableEvent } from "@connect/domain/observability-scrub";

export async function register(): Promise<void> {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }
  // Server and edge both reach this file; the browser SDK is only for the client.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
      beforeSend: (event) => scrubEvent(event as unknown as ScrubbableEvent) as unknown as typeof event,
    });
  }
}
