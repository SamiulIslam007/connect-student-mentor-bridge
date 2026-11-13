import { and, desc, eq, gte, lt, lte, or, type SQL } from "drizzle-orm";

import type { Database } from "../db/database.js";
import { auditLogs } from "../db/schema/index.js";
import type { AuditReadInput, AuditReadPage, AuditReadRow, AuditService } from "./audit.service.js";

/**
 * The projection is a fixed column list: `metadata`, `prev_hash` and `hash` are
 * never selected, so no writer can leak free text by adding a key (design R2).
 *
 * shortcut: the action filter is a scan, add an index when audit_logs passes
 * roughly a million rows (D-1xx, DEBT-58).
 */
const COLUMNS = {
  id: auditLogs.id,
  occurredAt: auditLogs.occurredAt,
  actorUserId: auditLogs.actorUserId,
  actorRole: auditLogs.actorRole,
  action: auditLogs.action,
  objectType: auditLogs.objectType,
  objectId: auditLogs.objectId,
  requestId: auditLogs.requestId,
  breakGlass: auditLogs.breakGlass,
  reason: auditLogs.reason,
} as const;

/** The cursor is the last row's `(occurred_at, id)` pair, which the indexes carry. */
export function encodeCursor(row: { occurredAt: Date; id: string }): string {
  return `${row.occurredAt.toISOString()}|${row.id}`;
}

export function decodeCursor(value: string): { occurredAt: Date; id: string } | null {
  const separator = value.indexOf("|");
  if (separator <= 0) {
    return null;
  }
  const occurredAt = new Date(value.slice(0, separator));
  const id = value.slice(separator + 1);
  if (Number.isNaN(occurredAt.getTime()) || id.length === 0) {
    return null;
  }
  return { occurredAt, id };
}

export class DrizzleAuditService implements AuditService {
  constructor(private readonly database: Database) {}

  async list(input: AuditReadInput): Promise<AuditReadPage> {
    const conditions: SQL[] = [];
    const { filters } = input;
    if (filters.actorId !== undefined) {
      conditions.push(eq(auditLogs.actorUserId, filters.actorId));
    }
    if (filters.action !== undefined) {
      conditions.push(eq(auditLogs.action, filters.action));
    }
    if (filters.objectType !== undefined) {
      conditions.push(eq(auditLogs.objectType, filters.objectType));
    }
    if (filters.objectId !== undefined) {
      conditions.push(eq(auditLogs.objectId, filters.objectId));
    }
    if (filters.from !== undefined) {
      conditions.push(gte(auditLogs.occurredAt, filters.from));
    }
    if (filters.to !== undefined) {
      conditions.push(lte(auditLogs.occurredAt, filters.to));
    }
    if (input.cursor !== undefined) {
      const cursor = decodeCursor(input.cursor);
      if (cursor !== null) {
        const keyset = or(
          lt(auditLogs.occurredAt, cursor.occurredAt),
          and(eq(auditLogs.occurredAt, cursor.occurredAt), lt(auditLogs.id, cursor.id)),
        );
        if (keyset !== undefined) {
          conditions.push(keyset);
        }
      }
    }

    const rows = await this.database
      .select(COLUMNS)
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.occurredAt), desc(auditLogs.id))
      .limit(input.limit + 1);

    const page = rows.slice(0, input.limit) as AuditReadRow[];
    const nextCursor = rows.length > input.limit && page.length > 0 ? encodeCursor(page[page.length - 1]) : null;
    return { rows: page, nextCursor };
  }
}
