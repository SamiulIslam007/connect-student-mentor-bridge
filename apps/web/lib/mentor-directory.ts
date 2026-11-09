import { strings } from "./strings";

/** One card of `GET /v1/mentors`; the API owns the projection. */
export interface MentorCard {
  id: string;
  display_name: string;
  headline: string;
  access_state: string;
  access_mode: string;
  primary_field: { id: string; name: string };
  fields: { id: string; name: string }[];
  languages: string[];
}

export interface MentorDirectoryPayload {
  data?: MentorCard[];
  next_cursor?: string | null;
}

/** The BFF query: only the five documented keys, empty values omitted. */
export function directoryQuery(input: {
  field?: string;
  accessState?: string;
  cursor?: string | null;
  limit?: number;
}): string {
  const params = new URLSearchParams();
  if (input.field) params.set("field", input.field);
  if (input.accessState) params.set("access_state", input.accessState);
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Appends a page without repeating a mentor after a concurrent insert. */
export function mergeCards(current: MentorCard[], next: MentorCard[]): MentorCard[] {
  const seen = new Set(current.map((card) => card.id));
  return [...current, ...next.filter((card) => !seen.has(card.id))];
}

export function accessStateLabel(state: string): string {
  switch (state) {
    case "available":
      return strings.mentors.stateAvailable;
    case "application_only":
      return strings.mentors.stateApplicationOnly;
    case "full":
      return strings.mentors.stateFull;
    default:
      return state;
  }
}

/** A full mentor is still listed, but the request action is disabled. */
export function canRequest(state: string): boolean {
  return state !== "full";
}
