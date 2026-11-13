import assert from "node:assert/strict";
import { test } from "node:test";

import { IdentityError as ApiError } from "@connect/domain";

import type { AuditEntry } from "../src/identity/audit-log.js";
import { ProblemDetailsFilter } from "../src/http/problem-details.filter.js";

/**
 * The denial branch of the exception filter, without a database or an HTTP
 * server: the response is a stub, the writer is a spy. The failure direction is
 * the point — a refusal must survive a dead audit store (design R5, D-152).
 */

interface Captured {
  status?: number;
  body?: Record<string, unknown>;
}

function hostFor(request: Record<string, unknown>): { host: never; captured: Captured } {
  const captured: Captured = {};
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    type() {
      return this;
    },
    json(body: Record<string, unknown>) {
      captured.body = body;
    },
    setHeader() {
      return this;
    },
    getHeaders() {
      return {};
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  };
  return { host: host as never, captured };
}

function bareDatabase(): never {
  return { insert: () => undefined } as never;
}

test("a refused sensitive action writes one row naming the role it is about", async () => {
  const written: AuditEntry[] = [];
  const filter = new ProblemDetailsFilter(bareDatabase(), async (_db, entry) => {
    written.push(entry);
  });
  const { host, captured } = hostFor({
    requestId: "request-1",
    method: "POST",
    originalUrl: "/v1/admin/accounts/x/reinstate?note=1",
    path: "/v1/admin/accounts/x/reinstate",
    actingAccount: { userId: "admin-1", roles: ["STUDENT", "PLATFORM_ADMIN"] },
    sensitiveDenial: { requiredRole: "PLATFORM_ADMIN" },
  });

  await filter.catch(new ApiError("MFA_REQUIRED", "this action requires an enrolled second factor"), host);

  assert.equal(captured.status, 403, "the refusal is unchanged");
  assert.equal(written.length, 1);
  assert.equal(written[0].action, "PERMISSION_DENIED");
  assert.equal(written[0].actorUserId, "admin-1");
  assert.equal(written[0].actorRole, "PLATFORM_ADMIN", "the role the refusal is about, not STUDENT");
  assert.equal(written[0].objectType, "users");
  assert.equal(written[0].requestId, "request-1");
  assert.deepEqual(written[0].metadata, {
    method: "POST",
    path: "/v1/admin/accounts/x/reinstate",
    required_role: "PLATFORM_ADMIN",
  });
});

test("a caller without the role records the highest role they hold", async () => {
  const written: AuditEntry[] = [];
  const filter = new ProblemDetailsFilter(bareDatabase(), async (_db, entry) => {
    written.push(entry);
  });
  const { host, captured } = hostFor({
    requestId: "request-2",
    method: "GET",
    originalUrl: "/v1/admin/audit",
    path: "/v1/admin/audit",
    actingAccount: { userId: "mentor-1", roles: ["STUDENT", "MENTOR"] },
    sensitiveDenial: { requiredRole: "PLATFORM_ADMIN" },
  });

  await filter.catch(new ApiError("ROLE_REQUIRED", "this action requires the platform_admin role"), host);

  assert.equal(captured.status, 403);
  assert.equal(written.length, 1);
  assert.equal(written[0].actorRole, "MENTOR");
});

test("an ordinary refusal, or one with no note, writes nothing", async () => {
  let calls = 0;
  const filter = new ProblemDetailsFilter(bareDatabase(), async () => {
    calls += 1;
  });
  const { host } = hostFor({
    requestId: "request-3",
    method: "POST",
    originalUrl: "/v1/requests",
    path: "/v1/requests",
    actingAccount: { userId: "mentor-1", roles: ["STUDENT", "MENTOR"] },
  });

  await filter.catch(new ApiError("ROLE_REQUIRED", "this action requires the student role"), host);
  assert.equal(calls, 0, "no note means no sensitive denial");

  const other = new ProblemDetailsFilter(bareDatabase(), async () => {
    calls += 1;
  });
  const { host: otherHost } = hostFor({
    requestId: "request-4",
    method: "POST",
    originalUrl: "/v1/requests",
    path: "/v1/requests",
    actingAccount: { userId: "student-1", roles: ["STUDENT"] },
    sensitiveDenial: { requiredRole: "PLATFORM_ADMIN" },
  });
  await other.catch(new ApiError("VALIDATION_ERROR", "mentor_id must be a valid id"), otherHost);
  assert.equal(calls, 0, "another refusal code writes nothing");
});

test("a dead audit store leaves the refusal intact and logs it", async () => {
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };
  try {
    const filter = new ProblemDetailsFilter(bareDatabase(), async () => {
      throw new Error("audit store unavailable");
    });
    const { host, captured } = hostFor({
      requestId: "request-5",
      method: "GET",
      originalUrl: "/v1/admin/audit",
      path: "/v1/admin/audit",
      actingAccount: { userId: "admin-1", roles: ["STUDENT", "PLATFORM_ADMIN"] },
      sensitiveDenial: { requiredRole: "PLATFORM_ADMIN" },
    });

    await filter.catch(new ApiError("MFA_REQUIRED", "this action requires an enrolled second factor"), host);

    assert.equal(captured.status, 403, "the refusal is still a 403");
    assert.equal(captured.body?.code, "MFA_REQUIRED");
    assert.equal(logged.length, 1);
    assert.match(logged[0], /audit\.denial_failed/);
  } finally {
    console.error = original;
  }
});

test("a filter built without a database writes nothing and still refuses", async () => {
  const filter = new ProblemDetailsFilter();
  const { host, captured } = hostFor({
    requestId: "request-6",
    method: "GET",
    originalUrl: "/v1/admin/audit",
    path: "/v1/admin/audit",
    actingAccount: { userId: "admin-1", roles: ["PLATFORM_ADMIN"] },
    sensitiveDenial: { requiredRole: "PLATFORM_ADMIN" },
  });
  await filter.catch(new ApiError("MFA_REQUIRED", "this action requires an enrolled second factor"), host);
  assert.equal(captured.status, 403);
});
