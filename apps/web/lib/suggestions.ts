import type { MentorCard } from "./mentor-directory";

/**
 * The suggestion read (`GET /api/suggestions`). The entry is the directory card
 * plus exactly two keys, so the page can reuse the directory's markup without a
 * second card shape.
 */
export interface Suggestion extends MentorCard {
  reasons: string[];
  limited_information: boolean;
}

/** The documented key set; `readSuggestions` drops anything else. */
export const SUGGESTION_KEYS = [
  "access_mode",
  "access_state",
  "display_name",
  "fields",
  "headline",
  "id",
  "languages",
  "limited_information",
  "primary_field",
  "reasons",
] as const;

function isSuggestion(entry: unknown): entry is Suggestion {
  if (typeof entry !== "object" || entry === null) {
    return false;
  }
  const value = entry as Record<string, unknown>;
  return (
    typeof value.id === "string" &&
    typeof value.display_name === "string" &&
    Array.isArray(value.reasons) &&
    value.reasons.every((reason): reason is string => typeof reason === "string")
  );
}

/** An absent or malformed payload reads as an empty set, never as an error. */
export function readSuggestions(payload: { data?: unknown } | null | undefined): Suggestion[] {
  const rows = payload?.data;
  return Array.isArray(rows) ? rows.filter(isSuggestion).slice(0, 5) : [];
}

/** At most three non-empty reason lines, in the order the API sent them. */
export function reasonLabels(entry: Suggestion): string[] {
  return entry.reasons.filter((reason) => reason.trim().length > 0).slice(0, 3);
}

/** Keeps the suggested set on its own: it never joins the directory page. */
export function mergeSuggestions(current: Suggestion[], next: Suggestion[]): Suggestion[] {
  const seen = new Set(current.map((entry) => entry.id));
  return [...current, ...next.filter((entry) => !seen.has(entry.id))];
}
