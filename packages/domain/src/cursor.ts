/**
 * The opaque cursor for the institution list (D-214): the `(name, id)` pair the
 * existing order sorts on, base64url-encoded so a caller cannot read it as a
 * contract. A malformed value is refused by the caller with `422`.
 */
export interface NameIdCursor {
  name: string;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeNameIdCursor(cursor: NameIdCursor): string {
  return Buffer.from(JSON.stringify([cursor.name, cursor.id]), "utf8").toString("base64url");
}

export function decodeNameIdCursor(value: string): NameIdCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    // Exactly the pair: an id-only or a name-only cursor is malformed.
    if (!Array.isArray(parsed) || parsed.length !== 2) {
      return null;
    }
    const [name, id] = parsed as unknown[];
    if (typeof name !== "string" || name.length === 0) {
      return null;
    }
    // A non-uuid id would reach the database as one and fail there, not here.
    if (typeof id !== "string" || !UUID.test(id)) {
      return null;
    }
    return { name, id };
  } catch {
    return null;
  }
}
