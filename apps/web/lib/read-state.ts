/**
 * Read state, computed without a browser (D-246, D-247).
 *
 * The server owns the marker: `unread_count` is what the API last reported and
 * `last_read_at` is the instant it holds. These helpers only decide what the two
 * surfaces render, so the rules are testable without a page.
 */

/** The window the thread waits before re-reading after a focus change. */
export const REFRESH_WINDOW_MS = 30_000;

export interface MessageLike {
  id: string;
  created_at: string;
}

/** A badge only when something is unread; the count is what the server said. */
export function unreadBadge(count: number | undefined): { count: number } | null {
  if (!count || count <= 0) {
    return null;
  }
  return { count };
}

/**
 * The id of the first message written after the marker, so the page can draw the
 * "new messages" divider before it. A missing or unparseable marker means every
 * message is new; a marker at or after the newest message means none is.
 */
export function newSince(marker: string | null | undefined, messages: MessageLike[]): string | null {
  if (messages.length === 0) {
    return null;
  }
  const markedAt = marker ? Date.parse(marker) : Number.NaN;
  if (Number.isNaN(markedAt)) {
    return messages[0].id;
  }
  const first = messages.find((message) => {
    const at = Date.parse(message.created_at);
    return !Number.isNaN(at) && at > markedAt;
  });
  return first?.id ?? null;
}

/**
 * True on the first load and again only once the refresh window has passed, so a
 * re-render or a quick remount cannot move the marker twice in a second.
 */
export function shouldMarkRead(
  lastMarkedAt: number | null,
  now: number,
  windowMs: number = REFRESH_WINDOW_MS,
): boolean {
  if (lastMarkedAt === null) {
    return true;
  }
  return now - lastMarkedAt >= windowMs;
}
