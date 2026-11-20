/**
 * The `Idempotency-Key` contract (SEC-API-7, D-215 to D-217). A key is 8 to 128
 * characters of letters, digits, dot, underscore and hyphen; the digest is taken
 * over a canonical JSON serialisation so two identical bodies with a different
 * key order are the same request.
 */
export function idempotencyKeyViolation(key: string): string | null {
  if (key.length < 8) {
    return "an Idempotency-Key must be at least 8 characters";
  }
  if (key.length > 128) {
    return "an Idempotency-Key must be at most 128 characters";
  }
  if (!/^[A-Za-z0-9._-]+$/.test(key)) {
    return "an Idempotency-Key may carry only letters, digits, dot, underscore and hyphen";
  }
  return null;
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sorted);
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      out[key] = sorted(source[key]);
    }
    return out;
  }
  return value;
}

/** Recursively key-sorted JSON; the digest is stable across key order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sorted(value ?? null)) ?? "null";
}
