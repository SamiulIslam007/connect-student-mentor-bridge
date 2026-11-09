import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";

import { replaySnapshots, type CountedEvent, type SnapshotTotal } from "@connect/domain";

import { DATABASE } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import {
  fieldImpactSnapshots,
  fields,
  mentorProfiles,
  reputationEvents,
} from "../db/schema/index.js";

export interface ImpactRow {
  fieldId: string;
  fieldName: string;
  outcomeType: string;
  count: number;
}

export interface ImpactReport {
  rows: ImpactRow[];
  countedOutcomes: number;
}

export interface StoredSnapshot extends SnapshotTotal {
  pointsTotal: number;
}

export interface ReputationService {
  /** Counts by field and outcome type; never a score, points, or ranking. */
  impactForUser(userId: string): Promise<ImpactReport>;
  /** `null` when the profile is absent or not `ACTIVE` (design D8). */
  impactForMentorProfile(mentorProfileId: string): Promise<ImpactReport | null>;
  /** Recomputes the snapshot from the ledger, for the replay test. */
  replay(mentorProfileId: string): Promise<SnapshotTotal[]>;
  storedSnapshots(mentorProfileId: string): Promise<StoredSnapshot[]>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class DrizzleReputationService implements ReputationService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async impactForUser(userId: string): Promise<ImpactReport> {
    const [mentor] = await this.db
      .select({ id: mentorProfiles.id })
      .from(mentorProfiles)
      .where(eq(mentorProfiles.userId, userId))
      .limit(1);
    if (!mentor) {
      return { rows: [], countedOutcomes: 0 };
    }
    return await this.impactForMentorProfile(mentor.id) ?? { rows: [], countedOutcomes: 0 };
  }

  async impactForMentorProfile(mentorProfileId: string): Promise<ImpactReport | null> {
    if (!UUID.test(mentorProfileId)) {
      return null;
    }
    const [mentor] = await this.db
      .select({ id: mentorProfiles.id, status: mentorProfiles.status })
      .from(mentorProfiles)
      .where(eq(mentorProfiles.id, mentorProfileId))
      .limit(1);
    if (!mentor || mentor.status !== "ACTIVE") {
      return null;
    }

    const rows = await this.db
      .select({
        fieldId: fieldImpactSnapshots.fieldId,
        fieldName: fields.name,
        outcomeType: fieldImpactSnapshots.outcomeType,
        count: fieldImpactSnapshots.countedCount,
      })
      .from(fieldImpactSnapshots)
      .innerJoin(fields, eq(fields.id, fieldImpactSnapshots.fieldId))
      .where(eq(fieldImpactSnapshots.mentorProfileId, mentorProfileId))
      .orderBy(fields.name, fieldImpactSnapshots.outcomeType);

    return {
      rows: rows.map((row) => ({
        fieldId: row.fieldId,
        fieldName: row.fieldName,
        outcomeType: row.outcomeType.toLowerCase(),
        count: row.count,
      })),
      countedOutcomes: rows.reduce((total, row) => total + row.count, 0),
    };
  }

  async replay(mentorProfileId: string): Promise<SnapshotTotal[]> {
    const rows = await this.db
      .select({
        mentorProfileId: reputationEvents.mentorProfileId,
        studentProfileId: reputationEvents.studentProfileId,
        fieldId: reputationEvents.fieldId,
        outcomeType: reputationEvents.outcomeType,
        points: reputationEvents.points,
        eventType: reputationEvents.eventType,
      })
      .from(reputationEvents)
      .where(eq(reputationEvents.mentorProfileId, mentorProfileId));

    const events: CountedEvent[] = rows.map((row) => ({
      mentorProfileId: row.mentorProfileId,
      studentProfileId: row.studentProfileId,
      fieldId: row.fieldId,
      outcomeType: row.outcomeType,
      points: Number(row.points),
      eventType: row.eventType,
    }));
    return replaySnapshots(events);
  }

  async storedSnapshots(mentorProfileId: string): Promise<StoredSnapshot[]> {
    const rows = await this.db
      .select({
        mentorProfileId: fieldImpactSnapshots.mentorProfileId,
        fieldId: fieldImpactSnapshots.fieldId,
        outcomeType: fieldImpactSnapshots.outcomeType,
        countedCount: fieldImpactSnapshots.countedCount,
        pointsTotal: fieldImpactSnapshots.pointsTotal,
      })
      .from(fieldImpactSnapshots)
      .where(and(eq(fieldImpactSnapshots.mentorProfileId, mentorProfileId)))
      .orderBy(sql`${fieldImpactSnapshots.fieldId}, ${fieldImpactSnapshots.outcomeType}`);

    return rows.map((row) => ({
      mentorProfileId: row.mentorProfileId,
      fieldId: row.fieldId,
      outcomeType: row.outcomeType,
      countedCount: row.countedCount,
      pointsTotal: Number(row.pointsTotal),
    }));
  }
}
