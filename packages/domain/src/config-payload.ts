/**
 * The configuration payload (FR-ADM-07, design R1): the values that price a
 * ledger row, and nothing else. Rate limits, cron strings and match weights are
 * deliberately absent — a form that could change them would be a
 * denial-of-service surface with an audit row instead of a code review.
 *
 * Pure: no Node import. The service hashes the normalised result with
 * `node:crypto`, and the migration's version-1 seed uses the same key order.
 */

export const CONFIG_PAYLOAD_KEYS = [
  "cooling_days",
  "difficulty_weights",
  "tier_multipliers",
  "contribution_multipliers",
  "audit_sample_rate",
] as const;

export const DIFFICULTY_MEMBERS = [
  "ADMISSION",
  "INTERNSHIP",
  "JOB_OFFER",
  "SKILL_MILESTONE",
  "INTERVIEW",
] as const;

export const TIER_MEMBERS = ["0", "1", "2"] as const;

export const CONTRIBUTION_MEMBERS = ["DIRECTLY_ENABLED", "HELPED", "MINOR"] as const;

/** The bounds one posted payload must sit inside (design R1). */
export const CONFIG_RANGES = {
  coolingDays: { min: 1, max: 90 },
  multiplier: { min: 0, max: 10 },
  auditSampleRate: { min: 0, max: 1 },
} as const;

export interface ConfigPayload {
  cooling_days: number;
  difficulty_weights: Record<string, number>;
  tier_multipliers: Record<string, number>;
  contribution_multipliers: Record<string, number>;
  audit_sample_rate: number;
}

export type ConfigPayloadResult =
  | { ok: true; payload: ConfigPayload }
  | { ok: false; field: string; message: string };

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Each map must carry exactly its enum's members: a missing key would fall back to 1 silently. */
function readMap(
  value: unknown,
  field: string,
  members: readonly string[],
  min: number,
  max: number,
): { ok: true; map: Record<string, number> } | { ok: false; field: string; message: string } {
  const raw = recordOf(value);
  if (!raw) {
    return { ok: false, field, message: `${field} must be an object` };
  }
  const keys = Object.keys(raw);
  const missing = members.filter((member) => !keys.includes(member));
  if (missing.length > 0) {
    return { ok: false, field, message: `${field} is missing ${missing.join(", ")}` };
  }
  const extra = keys.filter((key) => !members.includes(key));
  if (extra.length > 0) {
    return { ok: false, field, message: `${field} does not take ${extra.join(", ")}` };
  }
  const map: Record<string, number> = {};
  // Inserted in the enum's declared order, so the digest is stable.
  for (const member of members) {
    const entry = raw[member];
    if (!inRange(entry, min, max)) {
      return {
        ok: false,
        field: `${field}.${member}`,
        message: `${field}.${member} must be a number from ${min} to ${max}`,
      };
    }
    map[member] = entry;
  }
  return { ok: true, map };
}

/**
 * Validates and normalises one posted payload into the fixed key order the
 * digest is computed over. Anything unknown, missing or out of range is a
 * refusal that names its field.
 */
export function validateConfigPayload(input: unknown): ConfigPayloadResult {
  const raw = recordOf(input);
  if (!raw) {
    return { ok: false, field: "payload", message: "the payload must be an object" };
  }
  const extra = Object.keys(raw).filter(
    (key) => !(CONFIG_PAYLOAD_KEYS as readonly string[]).includes(key),
  );
  if (extra.length > 0) {
    return { ok: false, field: extra[0], message: `the payload does not take ${extra.join(", ")}` };
  }

  if (!Number.isInteger(raw.cooling_days)) {
    return { ok: false, field: "cooling_days", message: "cooling_days must be a whole number" };
  }
  if (!inRange(raw.cooling_days, CONFIG_RANGES.coolingDays.min, CONFIG_RANGES.coolingDays.max)) {
    return {
      ok: false,
      field: "cooling_days",
      message: `cooling_days must be from ${CONFIG_RANGES.coolingDays.min} to ${CONFIG_RANGES.coolingDays.max}`,
    };
  }

  const difficulty = readMap(
    raw.difficulty_weights,
    "difficulty_weights",
    DIFFICULTY_MEMBERS,
    CONFIG_RANGES.multiplier.min,
    CONFIG_RANGES.multiplier.max,
  );
  if (!difficulty.ok) {
    return difficulty;
  }
  const tiers = readMap(
    raw.tier_multipliers,
    "tier_multipliers",
    TIER_MEMBERS,
    CONFIG_RANGES.multiplier.min,
    CONFIG_RANGES.multiplier.max,
  );
  if (!tiers.ok) {
    return tiers;
  }
  const contributions = readMap(
    raw.contribution_multipliers,
    "contribution_multipliers",
    CONTRIBUTION_MEMBERS,
    CONFIG_RANGES.multiplier.min,
    CONFIG_RANGES.multiplier.max,
  );
  if (!contributions.ok) {
    return contributions;
  }

  if (
    !inRange(
      raw.audit_sample_rate,
      CONFIG_RANGES.auditSampleRate.min,
      CONFIG_RANGES.auditSampleRate.max,
    )
  ) {
    return {
      ok: false,
      field: "audit_sample_rate",
      message: `audit_sample_rate must be a number from ${CONFIG_RANGES.auditSampleRate.min} to ${CONFIG_RANGES.auditSampleRate.max}`,
    };
  }

  return {
    ok: true,
    payload: {
      cooling_days: raw.cooling_days,
      difficulty_weights: difficulty.map,
      tier_multipliers: tiers.map,
      contribution_multipliers: contributions.map,
      audit_sample_rate: raw.audit_sample_rate,
    },
  };
}
