import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";

import { replaySnapshots, type CountedEvent, type SnapshotTotal } from "@connect/domain";

import { DATABASE } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import {
  fieldImpactSnapshots,
  fields,
  mentorProfiles,
  mentorshipRequests,
  reputationEvents,
  users,
} from "../db/schema/index.js";
import { REQUEST_TTL_MS } from "../requests/drizzle-requests.service.js";

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

/**
 * The own-impact read adds two request counts (D-115, D-116). It is a separate
 * type so the public mentor read cannot gain them by accident.
 */
export interface OwnImpactReport extends ImpactReport {
  requestsDecidedInTime: number;
  requestsLateOrExpired: number;
}

/** The window in hours, derived from the one constant the sweeper applies. */
export const DECISION_WINDOW_HOURS = REQUEST_TTL_MS / (60 * 60 * 1000);

export interface StoredSnapshot extends SnapshotTotal {
  pointsTotal: number;
}

export interface ReputationService {
  /** Counts by field and outcome type plus the two request counts; never a score. */
  impactForUser(userId: string): Promise<OwnImpactReport>;
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

  async impactForUser(userId: string): Promise<OwnImpactReport> {
    const [mentor] = await this.db
      .select({ id: mentorProfiles.id })
      .from(mentorProfiles)
      .where(eq(mentorProfiles.userId, userId))
      .limit(1);
    if (!mentor) {
      return {
        rows: [],
        countedOutcomes: 0,
        requestsDecidedInTime: 0,
        requestsLateOrExpired: 0,
      };
    }
    const impact = await this.impactForMentorProfile(mentor.id);
    const reliability = await this.responseCounts(mentor.id);
    return {
      ...(impact ?? { rows: [], countedOutcomes: 0 }),
      ...reliability,
    };
  }

  /**
   * One aggregate pass over the mentor's requests. The rule mirrors
   * `responseReliability` in @connect/domain, and the integration test asserts
   * the two agree on the same rows.
   */
  private async responseCounts(
    mentorProfileId: string,
  ): Promise<{ requestsDecidedInTime: number; requestsLateOrExpired: number }> {
    const decided = sql`${mentorshipRequests.status} in ('ACCEPTED', 'DECLINED', 'REDIRECTED')`;
    const decidedAt = sql`${mentorshipRequests.decidedAt} is not null`;
    const window = sql`(${mentorshipRequests.createdAt} + (${DECISION_WINDOW_HOURS}::int * interval '1 hour'))`;

    const [row] = await this.db
      .select({
        inTime: sql<number>`count(*) filter (where ${decided} and ${decidedAt} and ${mentorshipRequests.decidedAt} <= ${window})`.mapWith(
          Number,
        ),
        late: sql<number>`count(*) filter (where ${mentorshipRequests.status} = 'EXPIRED' or (${decidedAt} and ${mentorshipRequests.decidedAt} > ${window}))`.mapWith(
          Number,
        ),
      })
      .from(mentorshipRequests)
      .where(eq(mentorshipRequests.mentorProfileId, mentorProfileId));

    return {
      requestsDecidedInTime: row?.inTime ?? 0,
      requestsLateOrExpired: row?.late ?? 0,
    };
  }

  async impactForMentorProfile(mentorProfileId: string): Promise<ImpactReport | null> {
    if (!UUID.test(mentorProfileId)) {
      return null;
    }
    const [mentor] = await this.db
      .select({ id: mentorProfiles.id, status: mentorProfiles.status })
      .from(mentorProfiles)
      .innerJoin(users, eq(users.id, mentorProfiles.userId))
      .where(and(eq(mentorProfiles.id, mentorProfileId), eq(users.status, "ACTIVE")))
      .limit(1);
    if (!mentor || mentor.status !== "ACTIVE") {
      // The public read follows the directory: an account that is not active has
      // no public impact, and a lift restores it with no write (D-147).
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
