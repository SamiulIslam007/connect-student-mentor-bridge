import { createHash } from "node:crypto";

import { breachCountFrom, rangePrefix } from "@connect/domain";

/**
 * The breach check seam (D-248, D-249).
 *
 * Only the first five characters of the SHA-1 leave the process, never the
 * password and never the full digest. Any failure - timeout, 5xx, a body that is
 * not the documented shape - answers `unavailable`, and the caller accepts the
 * password while one structured line records why.
 */
export interface PasswordBreachChecker {
  check(password: string): Promise<"clean" | "breached" | "unavailable">;
}

export const PASSWORD_BREACH_CHECKER = "PASSWORD_BREACH_CHECKER";

const RANGE_URL = "https://api.pwnedpasswords.com/range";
const TIMEOUT_MS = 3_000;
const CACHE_LIMIT = 500;

export interface BreachCheckerOptions {
  fetchImpl?: typeof fetch;
  log?: (line: Record<string, string>) => void;
  timeoutMs?: number;
}

/** The range endpoint answers the suffix list for one prefix; the prefix repeats. */
export function createPwnedPasswordsChecker({
  fetchImpl = fetch,
  log = (line) => console.warn(JSON.stringify(line)),
  timeoutMs = TIMEOUT_MS,
}: BreachCheckerOptions = {}): PasswordBreachChecker {
  const cache = new Map<string, string>();

  return {
    async check(password: string): Promise<"clean" | "breached" | "unavailable"> {
      const digest = createHash("sha1").update(password, "utf8").digest("hex");
      const prefix = rangePrefix(digest);
      if (!prefix) {
        return "unavailable";
      }

      let body = cache.get(prefix) ?? null;
      if (body === null) {
        try {
          const response = await fetchImpl(`${RANGE_URL}/${prefix}`, {
            headers: { "Add-Padding": "true" },
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!response.ok) {
            log({ event: "password.breach_check_unavailable", reason: `status ${response.status}` });
            return "unavailable";
          }
          body = await response.text();
        } catch (error) {
          log({
            event: "password.breach_check_unavailable",
            reason: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "request failed",
          });
          return "unavailable";
        }
        if (cache.size >= CACHE_LIMIT) {
          cache.clear();
        }
        cache.set(prefix, body);
      }

      const count = breachCountFrom(body, digest);
      if (count === null) {
        log({ event: "password.breach_check_unavailable", reason: "unreadable response" });
        return "unavailable";
      }
      return count > 0 ? "breached" : "clean";
    },
  };
}
