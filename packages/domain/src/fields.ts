/**
 * Field names are the public identity of a taxonomy concept (D-08). The
 * normalizer must be a pure string transformation so insert and lookup can never
 * disagree about which spelling is the same field.
 */

/** Display-name bound, mirroring the documented display-name limit. */
export const FIELD_NAME_MAX_LENGTH = 100;

/**
 * NFKC folds compatibility forms, Unicode `Cf` format characters (zero-width
 * space, bidi marks) are removed, separators collapse to one space, and
 * case-folding is locale-independent so Bangla (which has no case) survives
 * intact. Punctuation is not a separator: `C++` and `C` stay distinct.
 */
export function normalizeFieldName(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[\p{Cf}]/gu, "")
    .trim()
    .replace(/[\s_-]+/gu, " ")
    .toLowerCase()
    .trim();
}

/**
 * True when a submitted name is a usable display name and its normalized slug
 * contains at least one letter or number. A symbol-only or format-character-only
 * name would otherwise create an invisible or unfindable taxonomy row.
 */
export function isAcceptableFieldName(name: string): boolean {
  const trimmed = name.trim();
  const slug = normalizeFieldName(name);
  return (
    trimmed.length >= 1 &&
    trimmed.length <= FIELD_NAME_MAX_LENGTH &&
    slug.length > 0 &&
    /[\p{L}\p{N}]/u.test(slug)
  );
}
