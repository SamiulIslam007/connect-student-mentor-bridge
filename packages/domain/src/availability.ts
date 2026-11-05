/**
 * Weekly availability and mentor access mode (FR-PROF-01/02, design D2/D5).
 * Validation is pure and returns problems, so the API maps a non-empty list to
 * one `422 VALIDATION_FAILED` before any write, as the profile save does.
 */

/** Proposed default (D-38 sense): three windows a day, seven days. */
export const MAX_AVAILABILITY_WINDOWS_PER_CONTEXT = 21;

export type AvailabilityContext = "STUDENT" | "MENTOR";
export type MentorAccessMode = "OPEN" | "APPLICATION_ONLY" | "PAUSED";
/** The two modes a mentor may choose on the profile save; PAUSED is pause/resume only. */
export type MentorAccessModeChoice = "OPEN" | "APPLICATION_ONLY";
export type MentorStatus = "DRAFT" | "PENDING" | "ACTIVE" | "SUSPENDED" | "REMOVED";

/** Raw body values: a string such as `"9"` is not a minute, and is refused. */
export interface AvailabilityWindowDraft {
  weekday: unknown;
  startMinute: unknown;
  endMinute: unknown;
  timezone: unknown;
}

export interface AvailabilityWindow {
  weekday: number;
  startMinute: number;
  endMinute: number;
  timezone: string;
}

function wholeNumberIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/** The runtime owns the zone list, so no table of zones is bundled. */
export function isIanaTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export interface AvailabilityParseResult {
  windows: AvailabilityWindow[];
  problems: string[];
}

/**
 * The single validator. It returns the accepted windows alongside the problems,
 * so a caller never has to re-assert what validation already proved.
 */
export function parseAvailabilityWindows(
  windows: AvailabilityWindowDraft[],
): AvailabilityParseResult {
  const problems: string[] = [];

  if (windows.length > MAX_AVAILABILITY_WINDOWS_PER_CONTEXT) {
    problems.push(`at most ${MAX_AVAILABILITY_WINDOWS_PER_CONTEXT} windows per context are allowed`);
  }

  const accepted: AvailabilityWindow[] = [];
  windows.forEach((window, index) => {
    const label = `window ${index + 1}`;
    if (!wholeNumberIn(window.weekday, 1, 7)) {
      problems.push(`${label}: weekday must be a whole number from 1 to 7`);
      return;
    }
    if (!wholeNumberIn(window.startMinute, 0, 1440)) {
      problems.push(`${label}: the start minute must be a whole number from 0 to 1440`);
      return;
    }
    if (!wholeNumberIn(window.endMinute, 0, 1440)) {
      problems.push(`${label}: the end minute must be a whole number from 0 to 1440`);
      return;
    }
    if (window.endMinute <= window.startMinute) {
      problems.push(`${label}: the end minute must be after the start minute`);
      return;
    }
    if (typeof window.timezone !== "string" || !isIanaTimeZone(window.timezone)) {
      problems.push(`${label}: the time zone is not a valid IANA zone`);
      return;
    }
    accepted.push({
      weekday: window.weekday,
      startMinute: window.startMinute,
      endMinute: window.endMinute,
      timezone: window.timezone,
    });
  });

  // Touching endpoints (10:00-11:00 and 11:00-12:00) are allowed; any shared
  // minute is not.
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    const day = accepted
      .filter((window) => window.weekday === weekday)
      .sort((left, right) => left.startMinute - right.startMinute);
    for (let index = 1; index < day.length; index += 1) {
      if (day[index].startMinute < day[index - 1].endMinute) {
        problems.push(
          `windows overlap on weekday ${weekday} at minute ${day[index].startMinute}`,
        );
        break;
      }
    }
  }

  return { windows: accepted, problems };
}

export function validateAvailabilityWindows(windows: AvailabilityWindowDraft[]): string[] {
  return parseAvailabilityWindows(windows).problems;
}

/** Weekday, then start, then end: the order every read returns. */
export function sortWindows<T extends AvailabilityWindow>(windows: T[]): T[] {
  return [...windows].sort(
    (left, right) =>
      left.weekday - right.weekday ||
      left.startMinute - right.startMinute ||
      left.endMinute - right.endMinute,
  );
}

/** The only discovery policy: paused or not operating means not discoverable. */
export function isDiscoverable(input: {
  accessMode: MentorAccessMode;
  status: MentorStatus;
}): boolean {
  return input.accessMode !== "PAUSED" && input.status === "ACTIVE";
}
