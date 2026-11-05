import type {
  AvailabilityContext,
  AvailabilityWindow,
  AvailabilityWindowDraft,
  MentorAccessMode,
} from "@connect/domain";

export interface AvailabilityWindowRecord extends AvailabilityWindow {
  id: string;
  context: AvailabilityContext;
}

export interface ReadAvailabilityInput {
  userId: string;
  context: AvailabilityContext;
}

export interface ReplaceAvailabilityInput {
  userId: string;
  context: AvailabilityContext;
  /** Raw drafts: validation and conversion happen in one place (domain). */
  windows: AvailabilityWindowDraft[];
}

/**
 * The availability seam. The user id always comes from the session, so a body
 * cannot address another account's windows.
 */
export interface AvailabilityService {
  read(input: ReadAvailabilityInput): Promise<AvailabilityWindowRecord[]>;
  replace(input: ReplaceAvailabilityInput): Promise<AvailabilityWindowRecord[]>;
}

export interface SetMentorAccessModeInput {
  userId: string;
  accessMode: MentorAccessMode;
}

export function availabilityPayload(
  windows: AvailabilityWindowRecord[],
): Record<string, unknown>[] {
  return windows.map((window) => ({
    id: window.id,
    context: window.context,
    weekday: window.weekday,
    start_minute: window.startMinute,
    end_minute: window.endMinute,
    timezone: window.timezone,
  }));
}
