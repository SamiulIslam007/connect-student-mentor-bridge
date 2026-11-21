/**
 * Error tracking, inert without a DSN (D-251).
 *
 * `initObservability` is a no-op when no DSN is set, so local development and CI
 * behave as before. The scrub list itself lives in the domain package, shared
 * with the web app (D-251).
 */

import { scrubEvent, type ScrubbableEvent } from "@connect/domain";

export interface ObservabilityOptions {
  dsn?: string;
  environment?: string;
  release?: string;
  tracesSampleRate?: number;
}

export { scrubEvent, type ScrubbableEvent } from "@connect/domain";

export interface ObservabilityHandle {
  enabled: boolean;
  captureException(error: unknown): void;
}

/**
 * Starts error tracking when a DSN is present. The SDK is imported lazily so a
 * build without a DSN carries no initialisation path at all.
 */
export async function initObservability(
  options: ObservabilityOptions = {},
): Promise<ObservabilityHandle> {
  const dsn = options.dsn?.trim();
  if (!dsn) {
    return { enabled: false, captureException: () => {} };
  }

  const Sentry = await import("@sentry/node");
  Sentry.init({
    dsn,
    environment: options.environment ?? process.env.NODE_ENV ?? "production",
    release: options.release,
    tracesSampleRate: options.tracesSampleRate ?? 0,
    beforeSend: (event) => scrubEvent(event as unknown as ScrubbableEvent) as unknown as typeof event,
  });
  return {
    enabled: true,
    captureException: (error) => {
      Sentry.captureException(error);
    },
  };
}
