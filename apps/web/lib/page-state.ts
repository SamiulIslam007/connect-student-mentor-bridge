/**
 * The page state vocabulary (spec: experience/page-states). Pure, no React, so
 * the web tests assert a helper instead of a render.
 */
import { strings } from "./strings";

export const PAGE_STATES = ["idle", "loading", "error", "empty", "ready"] as const;
export type PageState = (typeof PAGE_STATES)[number];

export interface PageStatus {
  state: PageState;
  message: string | null;
}

/** The surfaces this sweep covers, keyed by their string-catalogue group. */
export type PageSurface =
  | "sessions"
  | "security"
  | "profile"
  | "requestNew"
  | "signIn"
  | "signUp"
  | "mfa"
  | "forgotPassword"
  | "reset"
  | "verify";

/** A load and a submit reach the same state; the page renders them differently. */
export function beginLoad(): PageStatus {
  return { state: "loading", message: null };
}

export function beginSubmit(): PageStatus {
  return { state: "loading", message: null };
}

/** A read that returned nothing is `empty`, never `ready` with a bare container. */
export function settleSuccess(empty = false): PageStatus {
  return { state: empty ? "empty" : "ready", message: null };
}

/** A failure keeps the server's own message when the problem details carry one. */
export function settleFailure(message: string | null): PageStatus {
  return { state: "error", message };
}

const LINES: Record<PageSurface, Partial<Record<PageState, string>>> = {
  sessions: {
    loading: strings.sessions.loading,
    empty: strings.sessions.empty,
    error: strings.sessions.loadError,
  },
  security: { loading: strings.security.loading, error: strings.security.error },
  profile: { loading: strings.profile.loading, error: strings.profile.loadError },
  requestNew: { loading: strings.requestNew.loading, error: strings.requestNew.error },
  signIn: { loading: strings.signIn.loading, error: strings.signIn.error },
  signUp: { loading: strings.signUp.loading, error: strings.signUp.error },
  mfa: { loading: strings.mfa.loading, error: strings.mfa.error },
  forgotPassword: { loading: strings.forgotPassword.loading, error: strings.forgotPassword.error },
  reset: { loading: strings.reset.loading, error: strings.reset.error },
  verify: { loading: strings.verify.loading, error: strings.verify.error },
};

/** The catalogue line a page renders for a state; empty when the state has none. */
export function stateKey(state: PageState, surface: PageSurface): string {
  return LINES[surface][state] ?? "";
}
