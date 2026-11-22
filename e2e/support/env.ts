import { resolveDatabaseUrl } from "../../services/api/src/db/database-url.ts";

/**
 * The browser path writes accounts, requests and outcomes, so it only ever runs
 * against a database whose name ends in `_test` (D-236). The URL is derived the
 * same way the integration suite derives it and is never printed.
 */
export function testDatabaseUrl(): string {
  const url = new URL(process.env.E2E_DATABASE_URL ?? resolveDatabaseUrl());
  if (!process.env.E2E_DATABASE_URL) {
    // Its own database: the integration suite already owns `connect_test` and
    // replays the migrations its own way, which leaves drizzle's journal empty.
    url.pathname = "/connect_e2e_test";
  }
  const name = url.pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(`the e2e suite refuses the database "${name}": its name must end in _test`);
  }
  return url.toString();
}

/** A fixed secret for the two processes the suite starts; it is never a real one. */
export const E2E_BETTER_AUTH_SECRET = "e2e-browser-path-secret-0123456789abcdef";

/** The BFF's shared secret: signs the client key and the sign-up intent (D-253, D-261). */
export const E2E_BFF_TRUST_SECRET = "e2e-bff-trust-secret-0123456789abcdef";

export const WEB_ORIGIN = process.env.E2E_WEB_ORIGIN ?? "http://127.0.0.1:3100";
export const API_ORIGIN = process.env.E2E_API_ORIGIN ?? "http://127.0.0.1:3101";
export const MAILPIT_HTTP_URL = process.env.MAILPIT_HTTP_URL ?? "http://127.0.0.1:8025";
export const SMTP_PORT = process.env.SMTP_PORT ?? "1025";
