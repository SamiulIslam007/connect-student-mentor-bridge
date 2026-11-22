/**
 * What an error report may carry (D-251).
 *
 * Shared by the API and the web app so both drop the same things; pure, so it is
 * tested without a browser or a Nest stack.
 */

/** Header names and body keys that must not leave the process. */
const SCRUB_HEADERS = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-csrf-token",
  "x-api-key",
  "proxy-authorization",
];

const SCRUB_KEYS = [
  "password",
  "newPassword",
  "currentPassword",
  "password_confirmation",
  "token",
  "access_token",
  "refresh_token",
  "session_token",
  "verification_token",
  "reset_token",
  "mfa_challenge",
  "secret",
  "email",
  "user_email",
  "username",
  "content",
  "message",
  "body",
  "text",
  "html",
  "email_body",
  "question",
  "answer",
  "summary",
  "note",
];

export interface ScrubbableEvent {
  request?: {
    headers?: Record<string, unknown>;
    cookies?: unknown;
    data?: unknown;
    query_string?: unknown;
  };
  breadcrumbs?: { data?: Record<string, unknown> }[];
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  /** The error report itself: the type stays, the value never does (SEC-AUDIT-023). */
  exception?: {
    values?: {
      type?: unknown;
      value?: unknown;
      stacktrace?: { frames?: { vars?: unknown }[] };
    }[];
  };
  user?: { email?: string; ip_address?: string; username?: string };
}

function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return "[scrubbed]";
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SCRUB_KEYS.includes(key) ? "[scrubbed]" : scrubValue(inner, depth + 1);
    }
    return out;
  }
  return value;
}

/** The event with every known carrier of personal data replaced. */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  const request = event.request;
  if (request) {
    if (request.headers) {
      const headers: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(request.headers)) {
        headers[key] = SCRUB_HEADERS.includes(key.toLowerCase()) ? "[scrubbed]" : value;
      }
      request.headers = headers;
    }
    if (request.cookies !== undefined) {
      request.cookies = "[scrubbed]";
    }
    if (request.data !== undefined) {
      request.data = scrubValue(request.data);
    }
    if (request.query_string !== undefined) {
      request.query_string = "[scrubbed]";
    }
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({ ...crumb, data: scrubValue(crumb.data) as Record<string, unknown> }));
  }
  if (event.extra) {
    event.extra = scrubValue(event.extra) as Record<string, unknown>;
  }
  if (event.contexts) {
    event.contexts = scrubValue(event.contexts) as Record<string, unknown>;
  }
  if (event.tags) {
    event.tags = scrubValue(event.tags) as Record<string, unknown>;
  }
  // An exception message is where a driver puts its SQL and params, so only the
  // class name survives; frame variables are scrubbed like any other payload.
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((value) => ({
      ...value,
      value: value.value === undefined ? value.value : "[scrubbed]",
      stacktrace: value.stacktrace
        ? {
            ...value.stacktrace,
            frames: value.stacktrace.frames?.map((frame) => ({
              ...frame,
              vars: scrubValue(frame.vars),
            })),
          }
        : value.stacktrace,
    }));
  }
  // An email address is a direct identifier; the id is enough to find the account.
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
    delete event.user.username;
  }
  return event;
}

