import assert from "node:assert/strict";

import {
  Module,
  type INestApplication,
  type MiddlewareConsumer,
  type NestModule,
  type Provider,
  type Type,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { BetterAuthIdentityService } from "../../src/identity/better-auth-identity.service.js";
import { createIdentityAuth } from "../../src/identity/better-auth.js";
import { IDENTITY_SERVICE } from "../../src/identity/identity.tokens.js";
import { createDatabaseConnection, type Database, type DatabaseConnection } from "../../src/db/database.js";
import type { EmailMessage, EmailSender } from "../../src/email/email-sender.js";
import { ProblemDetailsFilter } from "../../src/http/problem-details.filter.js";
import { RequestIdMiddleware } from "../../src/http/request-id.middleware.js";
import {
  openTestDatabase,
  resetDatabase,
  testDatabaseUrl,
  type TestDatabase,
} from "./database.js";

/** Test-only value: 32 identical characters, never used outside the test suite. */
const TEST_AUTH_SECRET = "x".repeat(32);
const APP_ORIGIN = "http://localhost:3000";

export const TEST_PASSWORD = "a sufficiently long passphrase";

export class RecordingEmailSender implements EmailSender {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }

  async last(template: EmailMessage["template"]): Promise<EmailMessage> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const found = [...this.messages].reverse().find((message) => message.template === template);
      if (found) {
        return found;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`no ${template} email was sent`);
  }

  reset(): void {
    this.messages.length = 0;
  }
}

export interface TestApiStack {
  client: TestDatabase["client"];
  database: DatabaseConnection;
  baseUrl: string;
  sender: RecordingEmailSender;
  identity: BetterAuthIdentityService;
  close(): Promise<void>;
}

export type StartApiStackResult =
  | { skipped: true; reason: string }
  | { skipped: false; stack: TestApiStack };

export interface StartApiStackOptions {
  controllers: Type<unknown>[];
  /** Controllers that need `request_id`; usually the same list as `controllers`. */
  requestIdRoutes: Type<unknown>[];
  /** Extra providers, built from the same database handle the API uses. */
  providers?: (database: Database) => Provider[];
}

/**
 * Boots the HTTP surface against the real `connect_test` database, replayed from
 * the checked-in migrations. Returns a skip result instead of failing when
 * Compose Postgres is not reachable, so a skipped suite is visible in the output.
 */
export async function startApiStack(
  options: StartApiStackOptions,
): Promise<StartApiStackResult> {
  const database: TestDatabase = await openTestDatabase();
  if (database.skipped) {
    return { skipped: true, reason: database.reason ?? "connect_test is not reachable" };
  }
  await resetDatabase(database.client);

  const connection = createDatabaseConnection(testDatabaseUrl());
  const sender = new RecordingEmailSender();
  const auth = createIdentityAuth({
    database: connection.db,
    emailSender: sender,
    secret: TEST_AUTH_SECRET,
    baseUrl: APP_ORIGIN,
  });
  const identity = new BetterAuthIdentityService({
    auth,
    database: connection.db,
    secret: TEST_AUTH_SECRET,
  });

  const controllers = options.controllers;
  const requestIdRoutes = options.requestIdRoutes;

  @Module({
    controllers,
    providers: [
      { provide: IDENTITY_SERVICE, useValue: identity },
      ...(options.providers ? options.providers(connection.db) : []),
    ],
  })
  class StackModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      consumer.apply(RequestIdMiddleware).forRoutes(...requestIdRoutes);
    }
  }

  const app: INestApplication = await NestFactory.create(StackModule, { logger: false });
  app.useGlobalFilters(new ProblemDetailsFilter());
  await app.listen(0, "127.0.0.1");
  const baseUrl = await app.getUrl();

  return {
    skipped: false,
    stack: {
      client: database.client,
      database: connection,
      baseUrl,
      sender,
      identity,
      async close(): Promise<void> {
        await app.close();
        await connection.pool.end();
        await database.client.end();
      },
    },
  };
}

export interface HttpResult {
  status: number;
  body: Record<string, unknown> | undefined;
  text: string;
}

export async function apiRequest(
  stack: TestApiStack,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
  sessionToken?: string,
): Promise<HttpResult> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (sessionToken) {
    headers.authorization = `Bearer ${sessionToken}`;
  }

  const response = await fetch(`${stack.baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : undefined,
    text,
  };
}

function tokenFromEmail(message: EmailMessage, pathFragment: string): string {
  const link = message.text.split("\n").find((line) => line.includes(pathFragment));
  assert.ok(link, `the email must contain ${pathFragment}`);
  const token = new URL(link).searchParams.get("token");
  assert.ok(token, "the link must carry a token");
  return token;
}

/** Registers and opens the verification link, which activates the account. */
export async function registerAndVerify(stack: TestApiStack, email: string): Promise<void> {
  const registration = await apiRequest(stack, "POST", "/v1/auth/register", {
    display_name: "Rahim Uddin",
    email,
    password: TEST_PASSWORD,
    date_of_birth: "2000-01-01",
  });
  assert.equal(registration.status, 200, "registration must succeed before verification");
  const token = tokenFromEmail(await stack.sender.last("verify-email"), "/api/auth/verify");
  const verified = await apiRequest(
    stack,
    "GET",
    `/v1/auth/verify?token=${encodeURIComponent(token)}`,
  );
  assert.equal(verified.status, 200);
}

export async function signIn(stack: TestApiStack, email: string): Promise<HttpResult> {
  return apiRequest(stack, "POST", "/v1/auth/sign-in", { email, password: TEST_PASSWORD });
}
