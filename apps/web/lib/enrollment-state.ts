/**
 * The security page's state machine (design D4). Secret material exists only in
 * `pending`, so no other phase can render a secret or a backup code.
 */
export type EnrollmentState =
  | { phase: "idle"; error: string | null }
  | { phase: "pending"; secret: string; uri: string; backupCodes: string[]; error: string | null }
  | { phase: "enrolled"; error: string | null }
  | { phase: "disabling"; error: string | null };

export type EnrollmentEvent =
  | { type: "loaded"; mfaEnabled: boolean }
  | { type: "enrolled"; secret: string; uri: string; backupCodes: string[] }
  | { type: "verified" }
  | { type: "disableRequested" }
  | { type: "disabled" }
  | { type: "failed"; message: string }
  | { type: "dismissed" };

export const initialEnrollmentState: EnrollmentState = { phase: "idle", error: null };

export function enrollReducer(state: EnrollmentState, event: EnrollmentEvent): EnrollmentState {
  switch (event.type) {
    case "loaded":
      return event.mfaEnabled ? { phase: "enrolled", error: null } : { phase: "idle", error: null };
    case "enrolled":
      return {
        phase: "pending",
        secret: event.secret,
        uri: event.uri,
        backupCodes: event.backupCodes,
        error: null,
      };
    case "verified":
      // Only a pending enrollment can be confirmed; a replayed event changes nothing.
      return state.phase === "pending" ? { phase: "enrolled", error: null } : state;
    case "disableRequested":
      return state.phase === "enrolled" ? { phase: "disabling", error: null } : state;
    case "disabled":
      return { phase: "idle", error: null };
    case "failed":
      // A refused password or code leaves the factor exactly as it was.
      return { ...state, error: event.message };
    case "dismissed":
      return { ...state, error: null };
  }
  return state;
}
