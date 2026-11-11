import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DRAFT_DEBOUNCE_MS,
  DRAFT_KEY_PREFIX,
  DRAFT_TTL_MS,
  clearAllDrafts,
  clearDraft,
  draftKey,
  parseDraft,
  readDraft,
  writeDraft,
  type DraftStorage,
  type RequestDraftValues,
} from "../lib/request-draft.js";

const values: RequestDraftValues = {
  question: "How do I start with backend engineering?",
  contextSummary: "Third-year CSE student, one internship.",
  targetOutcome: "A six-month plan",
  timeframe: "WITHIN_1_MONTH",
  interaction: "ASYNC_THREAD",
  applicationNote: "I can share my CV.",
};

class FakeStorage implements DraftStorage {
  readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/** A store whose every call throws, as a blocked or broken browser storage does. */
class ThrowingStorage implements DraftStorage {
  get length(): number {
    throw new Error("storage is unavailable");
  }

  key(): string | null {
    throw new Error("storage is unavailable");
  }

  getItem(): string | null {
    throw new Error("storage is unavailable");
  }

  setItem(): void {
    throw new Error("storage is unavailable");
  }

  removeItem(): void {
    throw new Error("storage is unavailable");
  }
}

/** A store that accepts reads and deletes but refuses writes, as a full store does. */
class QuotaStorage extends FakeStorage {
  override setItem(): void {
    const error = new Error("QuotaExceededError");
    error.name = "QuotaExceededError";
    throw error;
  }
}

test("a draft round-trips for the same mentor", () => {
  const storage = new FakeStorage();
  assert.equal(writeDraft("mentor-1", values, storage), true);
  assert.deepEqual(readDraft("mentor-1", storage), values);
});

test("a draft written for one mentor is never read for another", () => {
  const storage = new FakeStorage();
  writeDraft("mentor-1", values, storage);
  assert.equal(readDraft("mentor-2", storage), null);
});

test("a draft older than the ttl is ignored and removed", () => {
  const storage = new FakeStorage();
  const writtenAt = 1_000_000;
  writeDraft("mentor-1", values, storage, writtenAt);

  const justInside = readDraft("mentor-1", storage, writtenAt + DRAFT_TTL_MS);
  assert.deepEqual(justInside, values, "the boundary is inclusive");

  const expired = readDraft("mentor-1", storage, writtenAt + DRAFT_TTL_MS + 1);
  assert.equal(expired, null);
  assert.equal(storage.getItem(draftKey("mentor-1")), null, "the entry is removed");
});

test("a malformed stored value is ignored and removed", () => {
  for (const raw of ["not json", "{}", '{"savedAt":1}', '{"question":"x","savedAt":"now"}']) {
    const storage = new FakeStorage();
    storage.setItem(draftKey("mentor-1"), raw);
    assert.equal(readDraft("mentor-1", storage), null);
    assert.equal(storage.getItem(draftKey("mentor-1")), null);
  }
  assert.equal(parseDraft(null), null);
});

test("the stored value carries the six fields and a timestamp, and no credential", () => {
  const storage = new FakeStorage();
  writeDraft("mentor-1", values, storage);
  const parsed = JSON.parse(String(storage.getItem(draftKey("mentor-1")))) as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(parsed).sort(),
    ["applicationNote", "contextSummary", "interaction", "question", "savedAt", "targetOutcome", "timeframe"],
  );
  const text = JSON.stringify(parsed);
  for (const forbidden of ["token", "password", "session", "@"]) {
    assert.ok(!text.includes(forbidden), `the draft must not contain ${forbidden}`);
  }
});

test("an absent store never throws and never blocks sending", () => {
  assert.equal(readDraft("mentor-1", null), null);
  assert.equal(writeDraft("mentor-1", values, null), false);
  assert.doesNotThrow(() => clearDraft("mentor-1", null));
  assert.doesNotThrow(() => clearAllDrafts(null));
});

test("a throwing store degrades to a no-op", () => {
  const storage = new ThrowingStorage();
  assert.equal(readDraft("mentor-1", storage), null);
  assert.equal(writeDraft("mentor-1", values, storage), false);
  assert.doesNotThrow(() => clearDraft("mentor-1", storage));
  assert.doesNotThrow(() => clearAllDrafts(storage));
});

test("a quota-exceeded store refuses the write and the form keeps working", () => {
  const storage = new QuotaStorage();
  assert.equal(writeDraft("mentor-1", values, storage), false);
  assert.equal(readDraft("mentor-1", storage), null, "nothing was stored by the failed write");
  assert.doesNotThrow(() => clearDraft("mentor-1", storage));
});

test("clearAllDrafts removes every draft and nothing else", () => {
  const storage = new FakeStorage();
  writeDraft("mentor-1", values, storage);
  writeDraft("mentor-2", values, storage);
  storage.setItem("connect:other", "keep me");

  clearAllDrafts(storage);

  assert.equal(storage.getItem(draftKey("mentor-1")), null);
  assert.equal(storage.getItem(draftKey("mentor-2")), null);
  assert.equal(storage.getItem("connect:other"), "keep me");
  assert.equal(draftKey("mentor-1"), `${DRAFT_KEY_PREFIX}mentor-1`);
});

test("the form keeps the draft, applies it once, and clears it only on success", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../app/request/new/page.tsx", import.meta.url)),
    "utf8",
  );
  assert.ok(source.includes("readDraft("), "the form reads the draft");
  assert.equal(
    source.split("readDraft(").length - 1,
    1,
    "the draft is applied exactly once, not on every render",
  );
  assert.ok(source.includes("writeDraft("), "the form writes the draft");
  assert.ok(source.includes("DRAFT_DEBOUNCE_MS"), "the debounce comes from the helper");
  assert.ok(source.includes("clearDraft("), "a successful send clears the draft");

  const success = source.indexOf("window.location.href = \"/requests\"");
  const clear = source.indexOf("clearDraft(");
  assert.ok(success > 0 && clear > 0 && clear < success, "the clear sits in the success branch");
  assert.ok(
    source.includes("strings.requestNew.restoredDraft"),
    "the restored notice comes from the catalog",
  );
  assert.equal(DRAFT_DEBOUNCE_MS, 400);
});

test("both sign-out paths clear every draft", () => {
  const nav = readFileSync(fileURLToPath(new URL("../app/session-nav.tsx", import.meta.url)), "utf8");
  assert.ok(nav.includes("clearAllDrafts("), "the header sign-out clears drafts");

  const sessions = readFileSync(
    fileURLToPath(new URL("../app/account/sessions/page.tsx", import.meta.url)),
    "utf8",
  );
  assert.ok(sessions.includes("clearAllDrafts("), "sign-out-everywhere clears drafts");

  for (const source of [nav, sessions]) {
    const clear = source.indexOf("clearAllDrafts(");
    const redirect = source.indexOf("window.location.assign(\"/\")");
    assert.ok(redirect > 0 && clear > 0 && clear < redirect, "the clear precedes the redirect");
  }
});
