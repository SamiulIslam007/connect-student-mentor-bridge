/** Minimum age for registration (FR-AUTH-03). */
export const MINIMUM_AGE = 18;

/** Version of the wording shown while the gate is evaluated; stored with the result. */
export const AGE_GATE_VERSION = "age-gate-2026-11";

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function parseCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));

  // Reject rolled-over values such as 2008-02-31.
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * True when the person born on `dateOfBirth` is at least 18 on `now`, compared
 * in UTC calendar days. A 29 February birthday is treated as 28 February in
 * non-leap years. An unparseable date is not an adult.
 */
export function isAtLeast18(dateOfBirth: string, now: Date): boolean {
  const birth = parseCalendarDate(dateOfBirth);
  if (!birth) {
    return false;
  }

  const anniversaryYear = birth.year + MINIMUM_AGE;
  const anniversary = {
    year: anniversaryYear,
    month: birth.month,
    day: Math.min(birth.day, daysInMonth(anniversaryYear, birth.month)),
  };
  const today = {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
  };

  if (today.year !== anniversary.year) {
    return today.year > anniversary.year;
  }
  if (today.month !== anniversary.month) {
    return today.month > anniversary.month;
  }
  return today.day >= anniversary.day;
}

/** `YYYY-MM-DD` shape check for request validation, before the age comparison. */
export function isCalendarDate(value: string): boolean {
  return parseCalendarDate(value) !== null;
}
