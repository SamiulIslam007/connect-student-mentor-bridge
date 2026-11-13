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
/** The four availability fields, all-or-nothing (D-143). */
export interface AvailabilityFilter {
  weekday: string;
  start: string; // HH:MM, empty when unset
  end: string;
  timezone: string;
}

export function emptyAvailability(): AvailabilityFilter {
  return { weekday: "", start: "", end: "", timezone: "" };
}

/** `HH:MM` to minute of day; null when the input is not a time. */
export function minuteOfDay(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

/** The browser's own zone, so a student abroad is not silently wrong (R6). */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Dhaka";
  } catch {
    return "Asia/Dhaka";
  }
}

/**
 * True only when a weekday is chosen; the page sends all four together or none,
 * because the API refuses a partial set.
 */
export function availabilityActive(filter: AvailabilityFilter): boolean {
  return filter.weekday.trim() !== "";
}

export function directoryQuery(input: {
  field?: string;
  accessState?: string;
  cursor?: string | null;
  limit?: number;
  availability?: AvailabilityFilter;
}): string {
  const params = new URLSearchParams();
  if (input.field) params.set("field", input.field);
  if (input.accessState) params.set("access_state", input.accessState);
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  const availability = input.availability;
  if (availability && availabilityActive(availability)) {
    // Whatever the viewer typed is forwarded, even when incomplete: the API owns
    // validation and answers a partial or inverted window with its own `422`.
    const start = minuteOfDay(availability.start);
    const end = minuteOfDay(availability.end);
    params.set("available_weekday", availability.weekday);
    params.set("available_start", start === null ? availability.start : String(start));
    params.set("available_end", end === null ? availability.end : String(end));
    params.set("available_timezone", availability.timezone || browserTimeZone());
  }
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
