/**
 * The breach rule, without I/O (D-248).
 *
 * The caller hashes and fetches; this decides. `null` means the provider's answer
 * was not the documented shape, so "unparseable" and "clean" stay different
 * answers and the caller can fail open on purpose rather than by accident.
 */

const DIGEST = /^[0-9a-f]{40}$/i;

/** The five hex characters sent to the provider; uppercase, as the API uses. */
export function rangePrefix(sha1Hex: string): string | null {
  const digest = sha1Hex.trim();
  if (!DIGEST.test(digest)) {
    return null;
  }
  return digest.slice(0, 5).toUpperCase();
}

/**
 * The count for this digest's suffix: 0 when the body is well formed and the
 * suffix is absent (padded rows carry 0 and are treated as clean), null when the
 * body has no usable line at all.
 */
export function breachCountFrom(body: string, sha1Hex: string): number | null {
  const digest = sha1Hex.trim();
  if (!DIGEST.test(digest)) {
    return null;
  }
  const suffix = digest.slice(5).toUpperCase();
  let sawLine = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") {
      continue;
    }
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const candidate = line.slice(0, separator).trim().toUpperCase();
    const count = Number(line.slice(separator + 1).trim());
    if (candidate.length !== 35 || !Number.isInteger(count) || count < 0) {
      continue;
    }
    sawLine = true;
    if (candidate === suffix) {
      return count;
    }
  }
  return sawLine ? 0 : null;
}
