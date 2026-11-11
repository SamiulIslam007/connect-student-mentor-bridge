/**
 * The on-device request draft (spec: mentorship/request-lifecycle). Pure: the
 * storage object is a parameter, so every rule is testable without a browser.
 * Storage holds the six form values only — never a token, a password or an email
 * (`identity/email-password-auth` keeps credentials out of browser storage).
 */

export const DRAFT_KEY_PREFIX = "connect:request-draft:";

/** A draft older than this is ignored and removed on the next read (D-105). */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1_000;

/** One write per typing pause; a hard tab kill can lose this window (DEBT-48). */
export const DRAFT_DEBOUNCE_MS = 400;

export interface RequestDraftValues {
  question: string;
  contextSummary: string;
  targetOutcome: string;
  timeframe: string;
  interaction: string;
  applicationNote: string;
}

export interface StoredDraft extends RequestDraftValues {
  /** Milliseconds since the epoch, written with the values. */
  savedAt: number;
}

const FIELDS = [
  "question",
  "contextSummary",
  "targetOutcome",
  "timeframe",
  "interaction",
  "applicationNote",
] as const;

/** The subset of `Storage` the helper uses, so a fake satisfies it. */
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function draftKey(mentorId: string): string {
  return `${DRAFT_KEY_PREFIX}${mentorId}`;
}

/** Absent in a browser that blocks storage; null means "no draft support". */
export function defaultDraftStorage(): DraftStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function logFailure(operation: string, error: unknown): void {
  console.error(
    JSON.stringify({
      event: "web.request_draft_failed",
      operation,
      message: error instanceof Error ? error.message : "unknown error",
    }),
  );
}

/** Shape-validates a stored entry; any mismatch is null, never a repaired draft. */
export function parseDraft(raw: string | null): StoredDraft | null {
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.savedAt !== "number" || !Number.isFinite(candidate.savedAt)) {
    return null;
  }
  for (const field of FIELDS) {
    if (typeof candidate[field] !== "string") {
      return null;
    }
  }
  return {
    question: candidate.question as string,
    contextSummary: candidate.contextSummary as string,
    targetOutcome: candidate.targetOutcome as string,
    timeframe: candidate.timeframe as string,
    interaction: candidate.interaction as string,
    applicationNote: candidate.applicationNote as string,
    savedAt: candidate.savedAt,
  };
}

function valuesOf(draft: StoredDraft): RequestDraftValues {
  return {
    question: draft.question,
    contextSummary: draft.contextSummary,
    targetOutcome: draft.targetOutcome,
    timeframe: draft.timeframe,
    interaction: draft.interaction,
    applicationNote: draft.applicationNote,
  };
}

/**
 * The draft for one mentor, or null. A malformed or expired entry is removed so
 * it cannot resurface; a storage failure reads as "no draft" and never throws.
 */
export function readDraft(
  mentorId: string,
  storage: DraftStorage | null = defaultDraftStorage(),
  now: number = Date.now(),
): RequestDraftValues | null {
  const key = draftKey(mentorId);
  try {
    const raw = storage?.getItem(key) ?? null;
    if (raw === null) {
      return null;
    }
    const stored = parseDraft(raw);
    if (!stored || now - stored.savedAt > DRAFT_TTL_MS) {
      storage?.removeItem(key);
      return null;
    }
    return valuesOf(stored);
  } catch (error) {
    logFailure("read", error);
    return null;
  }
}

/** True when the values were stored; a full or absent store is a silent false. */
export function writeDraft(
  mentorId: string,
  values: RequestDraftValues,
  storage: DraftStorage | null = defaultDraftStorage(),
  now: number = Date.now(),
): boolean {
  try {
    storage?.setItem(draftKey(mentorId), JSON.stringify({ ...values, savedAt: now }));
    return storage !== null;
  } catch (error) {
    logFailure("write", error);
    return false;
  }
}

export function clearDraft(
  mentorId: string,
  storage: DraftStorage | null = defaultDraftStorage(),
): void {
  try {
    storage?.removeItem(draftKey(mentorId));
  } catch (error) {
    logFailure("clear", error);
  }
}

/** Every draft under the prefix; used on sign-out (D-106). Never throws. */
export function clearAllDrafts(storage: DraftStorage | null = defaultDraftStorage()): void {
  try {
    if (!storage) {
      return;
    }
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (typeof key === "string" && key.startsWith(DRAFT_KEY_PREFIX)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      storage.removeItem(key);
    }
  } catch (error) {
    logFailure("clear_all", error);
  }
}
