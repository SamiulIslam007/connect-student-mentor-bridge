import { strings } from "./strings";

/**
 * The audit page's pure rules (design R6): the filter-to-query builder, the row
 * type, and the two formatters. No fetch, no React, so the page test asserts a
 * helper instead of a render.
 */
export const AUDIT_FILTER_KEYS = [
  "actor",
  "action",
  "object_type",
  "object_id",
  "from",
  "to",
] as const;

export type AuditFilterKey = (typeof AUDIT_FILTER_KEYS)[number];
export type AuditFilters = Record<AuditFilterKey, string>;

export interface AuditRow {
  id: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_role: string;
  action: string;
  object_type: string;
  object_id: string | null;
  request_id: string;
  break_glass: boolean;
  reason: string | null;
}

export interface AuditPage {
  data: AuditRow[];
  next_cursor: string | null;
}

export function emptyFilters(): AuditFilters {
  return { actor: "", action: "", object_type: "", object_id: "", from: "", to: "" };
}

/** Only the set filters are sent, so the URL stays honest about what it does. */
export function buildAuditQuery(filters: Partial<AuditFilters>, cursor: string | null = null): string {
  const query = new URLSearchParams();
  for (const key of AUDIT_FILTER_KEYS) {
    const value = (filters[key] ?? "").trim();
    if (value !== "") {
      query.set(key, value);
    }
  }
  if (cursor) {
    query.set("cursor", cursor);
  }
  const suffix = query.toString();
  return suffix === "" ? "" : `?${suffix}`;
}

/** The row's own reason, or the catalogue line that says there is none. */
export function reasonText(row: AuditRow): string {
  return row.reason && row.reason.trim() !== "" ? row.reason : strings.audit.noReason;
}

/** A break-glass row is marked in the table; every other row is not. */
export function breakGlassMarker(row: AuditRow): string | null {
  return row.break_glass ? strings.audit.breakGlass : null;
}

/** The row's instant as a stable UTC string, never a locale-dependent one. */
export function occurredAtText(row: AuditRow): string {
  const date = new Date(row.occurred_at);
  return Number.isNaN(date.getTime()) ? row.occurred_at : date.toISOString();
}

/** Reads the page's filter state back out of a query string. */
export function filtersFromQuery(search: string): AuditFilters {
  const params = new URLSearchParams(search);
  const filters = emptyFilters();
  for (const key of AUDIT_FILTER_KEYS) {
    filters[key] = params.get(key) ?? "";
  }
  return filters;
}
