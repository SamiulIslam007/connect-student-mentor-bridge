/**
 * Field names are the public identity of a taxonomy concept (D-08). The
 * normalizer must be a pure string transformation so insert and lookup can never
 * disagree about which spelling is the same field.
 */

/** Display-name bound, mirroring the documented display-name limit. */
export const FIELD_NAME_MAX_LENGTH = 100;

/**
 * NFKC folds compatibility forms, separators collapse to one space, and
 * case-folding is locale-independent so Bangla (which has no case) survives
 * intact. Punctuation is not a separator: `C++` and `C` stay distinct.
 */
export function normalizeFieldName(input: string): string {
  return input
    .normalize("NFKC")
    .trim()
    .replace(/[\s_-]+/gu, " ")
    .toLowerCase()
    .trim();
}

/** True when a submitted name is a usable display name and has a non-empty slug. */
export function isAcceptableFieldName(name: string): boolean {
  const trimmed = name.trim();
  return (
    trimmed.length >= 1 &&
    trimmed.length <= FIELD_NAME_MAX_LENGTH &&
    normalizeFieldName(name).length > 0
  );
}
