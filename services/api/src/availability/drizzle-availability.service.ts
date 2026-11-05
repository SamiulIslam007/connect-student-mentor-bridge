import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { IdentityError, parseAvailabilityWindows, sortWindows } from "@connect/domain";

import { DATABASE } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { availabilityWindows } from "../db/schema/index.js";
import type {
  AvailabilityService,
  AvailabilityWindowRecord,
  ReadAvailabilityInput,
  ReplaceAvailabilityInput,
} from "./availability.service.js";

type WindowRow = typeof availabilityWindows.$inferSelect;

function toRecords(rows: WindowRow[]): AvailabilityWindowRecord[] {
  return sortWindows(
    rows.map((row) => ({
      id: row.id,
      context: row.context,
      weekday: row.weekday,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      timezone: row.timezone,
    })),
  );
}

@Injectable()
export class DrizzleAvailabilityService implements AvailabilityService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async read({ userId, context }: ReadAvailabilityInput): Promise<AvailabilityWindowRecord[]> {
    const rows = await this.db
      .select()
      .from(availabilityWindows)
      .where(
        and(eq(availabilityWindows.userId, userId), eq(availabilityWindows.context, context)),
      );
    return toRecords(rows);
  }

  /** Full replace for one context (design D3): the caller's set or nothing. */
  async replace({
    userId,
    context,
    windows,
  }: ReplaceAvailabilityInput): Promise<AvailabilityWindowRecord[]> {
    const { windows: accepted, problems } = parseAvailabilityWindows(windows);
    if (problems.length > 0) {
      throw new IdentityError("VALIDATION_ERROR", problems.join("; "));
    }

    return await this.db.transaction(async (tx) => {
      await tx
        .delete(availabilityWindows)
        .where(
          and(eq(availabilityWindows.userId, userId), eq(availabilityWindows.context, context)),
        );
      if (accepted.length > 0) {
        await tx.insert(availabilityWindows).values(
          accepted.map((window) => ({
            userId,
            context,
            weekday: window.weekday,
            startMinute: window.startMinute,
            endMinute: window.endMinute,
            timezone: window.timezone,
          })),
        );
      }
      const saved = await tx
        .select()
        .from(availabilityWindows)
        .where(
          and(eq(availabilityWindows.userId, userId), eq(availabilityWindows.context, context)),
        );
      return toRecords(saved);
    });
  }
}
