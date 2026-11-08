import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_PENDING_REQUESTS_PER_STUDENT,
  canCreateRequest,
  requestTransition,
  slotsInUse,
  type CanCreateRequestInput,
  type RequestAction,
  type RequestStatus,
} from "../src/request.js";

test("only a pending request can transition, and each action has one target", () => {
  const targets: Record<RequestAction, RequestStatus> = {
    accept: "ACCEPTED",
    decline: "DECLINED",
    withdraw: "WITHDRAWN",
    expire: "EXPIRED",
  };
  for (const action of Object.keys(targets) as RequestAction[]) {
    assert.equal(requestTransition("PENDING", action), targets[action]);
    for (const status of ["ACCEPTED", "DECLINED", "REDIRECTED", "EXPIRED", "WITHDRAWN"] as const) {
      assert.equal(requestTransition(status, action), null, `${action} from ${status}`);
    }
  }
});

test("slots in use add pending and accepted-in-window and never go negative", () => {
  assert.equal(slotsInUse({ pending: 1, acceptedInWindow: 2 }), 3);
  assert.equal(slotsInUse({ pending: 0, acceptedInWindow: 0 }), 0);
  assert.equal(slotsInUse({ pending: -1, acceptedInWindow: -2 }), 0);
});

function input(overrides: Partial<CanCreateRequestInput> = {}): CanCreateRequestInput {
  return {
    mentor: {
      userId: "mentor-user",
      status: "ACTIVE",
      accessMode: "OPEN",
      level: "LEVEL_1",
    },
    callerUserId: "student-user",
    hasStudentProfile: true,
    slotsInUse: 0,
    weeklyCapacity: 2,
    pendingForPair: false,
    pendingForStudent: 0,
    applicationNote: null,
    interactionType: "ASYNC_THREAD",
    ...overrides,
  };
}

function refusal(overrides: Partial<CanCreateRequestInput>): string {
  const result = canCreateRequest(input(overrides));
  assert.equal(result.ok, false);
  return result.ok ? "" : result.code;
}

test("a fully eligible request passes", () => {
  assert.deepEqual(canCreateRequest(input()), { ok: true });
});

test("group office hours is a field error", () => {
  assert.equal(refusal({ interactionType: "GROUP_OFFICE_HOURS" }), "VALIDATION_ERROR");
});

test("requesting yourself is refused", () => {
  assert.equal(refusal({ callerUserId: "mentor-user" }), "VALIDATION_ERROR");
});

test("a caller without a student profile is refused", () => {
  assert.equal(refusal({ hasStudentProfile: false }), "VALIDATION_ERROR");
});

test("a mentor below Level 1 is refused as unverified", () => {
  assert.equal(refusal({ mentor: { ...input().mentor, level: null } }), "MENTOR_NOT_VERIFIED");
  assert.equal(
    refusal({ mentor: { ...input().mentor, level: "LEVEL_0" } }),
    "MENTOR_NOT_VERIFIED",
  );
});

test("a non-operating or paused mentor is unavailable", () => {
  for (const status of ["DRAFT", "PENDING", "SUSPENDED", "REMOVED"]) {
    assert.equal(
      refusal({ mentor: { ...input().mentor, status } }),
      "MENTOR_UNAVAILABLE",
      `status ${status}`,
    );
  }
  assert.equal(
    refusal({ mentor: { ...input().mentor, accessMode: "PAUSED" } }),
    "MENTOR_UNAVAILABLE",
  );
});

test("a duplicate pending request is refused before capacity", () => {
  assert.equal(refusal({ pendingForPair: true, slotsInUse: 9 }), "DUPLICATE_PENDING_REQUEST");
});

test("the per-student pending cap is three", () => {
  assert.deepEqual(
    canCreateRequest(input({ pendingForStudent: MAX_PENDING_REQUESTS_PER_STUDENT - 1 })),
    { ok: true },
  );
  assert.equal(
    refusal({
      pendingForStudent: MAX_PENDING_REQUESTS_PER_STUDENT,
      slotsInUse: 0,
    }),
    "REQUEST_LIMIT_REACHED",
  );
});

test("capacity holds at cap minus one, cap, and cap plus one", () => {
  const capacity = 2;
  assert.deepEqual(
    canCreateRequest(input({ weeklyCapacity: capacity, slotsInUse: capacity - 1 })),
    { ok: true },
  );
  assert.equal(
    refusal({ weeklyCapacity: capacity, slotsInUse: capacity }),
    "MENTOR_AT_CAPACITY",
  );
  assert.equal(
    refusal({ weeklyCapacity: capacity, slotsInUse: capacity + 1 }),
    "MENTOR_AT_CAPACITY",
  );
});

test("application-only needs a non-empty note and open needs none", () => {
  const applicationOnly = { ...input().mentor, accessMode: "APPLICATION_ONLY" as const };
  assert.equal(refusal({ mentor: applicationOnly }), "VALIDATION_ERROR");
  assert.equal(refusal({ mentor: applicationOnly, applicationNote: "   " }), "VALIDATION_ERROR");
  assert.deepEqual(canCreateRequest(input({ mentor: applicationOnly, applicationNote: "Why me" })), {
    ok: true,
  });
  assert.deepEqual(canCreateRequest(input({ applicationNote: null })), { ok: true });
});
