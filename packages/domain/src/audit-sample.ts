import { AUDIT_ALWAYS_SAMPLED_OUTCOME_TYPES, AUDIT_SAMPLE_RATE, AUDIT_SAMPLE_SALT } from "@connect/config";

/**
 * The audit draw (`FR-ADM-03`, design R1): a stable in-or-out answer for one
 * outcome id, so a job retry can never re-roll the sample.
 *
 * FNV-1a is used on purpose: `packages/domain` may not import a Node built-in,
 * and the draw needs no cryptographic strength. Outcome ids are server-generated
 * UUIDs a client cannot choose, and knowing the answer gains nothing, because a
 * selected outcome is held for review either way.
 */
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const TWO_TO_THE_32 = 2 ** 32;

export function auditSampleDraw(outcomeId: string): number {
  const input = `${AUDIT_SAMPLE_SALT}:${outcomeId}`;
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash / TWO_TO_THE_32;
}

/**
 * `ALWAYS` for the named high-consequence types regardless of the rate, then
 * `SAMPLED` or `SKIPPED` against the rate. A rate of `0` still selects those
 * types; a rate of `1` selects everything.
 */
export function shouldSample(input: {
  outcomeId: string;
  outcomeType: string;
  rate?: number;
}): "ALWAYS" | "SAMPLED" | "SKIPPED" {
  if ((AUDIT_ALWAYS_SAMPLED_OUTCOME_TYPES as readonly string[]).includes(input.outcomeType)) {
    return "ALWAYS";
  }
  const rate = input.rate ?? AUDIT_SAMPLE_RATE;
  return auditSampleDraw(input.outcomeId) < rate ? "SAMPLED" : "SKIPPED";
}
