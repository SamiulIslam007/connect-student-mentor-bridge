import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, sql } from "drizzle-orm";

import { DATABASE } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import {
  affiliations,
  fields,
  mentorProfiles,
  mentorships,
  mentorshipRequests,
  outcomes,
  users,
} from "../db/schema/index.js";
import { DECISION_WINDOW_HOURS } from "../reputation/drizzle-reputation.service.js";
import type {
  InstitutionAggregateCounts,
  InstitutionDashboardService,
} from "./institution-dashboard.service.js";

/**
 * One aggregate read per metric group, each with the institution filter pushed
 * into its join (design R1/R2). The mentor set is one rule — an `ACTIVE` profile
 * on an `ACTIVE` account with a `VERIFIED` affiliation to this institution — and
 * every metric that speaks about mentors reuses it.
 */
@Injectable()
export class DrizzleInstitutionDashboardService implements InstitutionDashboardService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private mentorScope(institutionId: string) {
    return sql`${mentorProfiles.status} = 'ACTIVE' and ${users.status} = 'ACTIVE' and exists (select 1 from affiliations a where a.user_id = ${mentorProfiles.userId} and a.institution_id = ${institutionId}::uuid and a.status = 'VERIFIED')`;
  }

  async aggregates(institutionId: string): Promise<InstitutionAggregateCounts> {
    const scope = this.mentorScope(institutionId);

    const [alumni] = await this.db
      .select({ value: sql<number>`count(distinct ${affiliations.userId})`.mapWith(Number) })
      .from(affiliations)
      .where(
        and(
          eq(affiliations.institutionId, institutionId),
          eq(affiliations.status, "VERIFIED"),
        ),
      );

    const [mentors] = await this.db
      .select({ value: sql<number>`count(distinct ${mentorProfiles.userId})`.mapWith(Number) })
      .from(mentorProfiles)
      .innerJoin(users, eq(users.id, mentorProfiles.userId))
      .where(scope);

    const [requests] = await this.db
      .select({
        received: sql<number>`count(*)`.mapWith(Number),
        accepted: sql<number>`count(*) filter (where ${mentorshipRequests.status} = 'ACCEPTED')`.mapWith(
          Number,
        ),
        decided: sql<number>`count(*) filter (where ${mentorshipRequests.status} in ('ACCEPTED', 'DECLINED', 'EXPIRED'))`.mapWith(
          Number,
        ),
        // The partition `responseReliability` defines, hour for hour.
        inTime: sql<number>`count(*) filter (where ${mentorshipRequests.status} in ('ACCEPTED', 'DECLINED', 'REDIRECTED') and ${mentorshipRequests.decidedAt} is not null and ${mentorshipRequests.decidedAt} <= ${mentorshipRequests.createdAt} + (${DECISION_WINDOW_HOURS}::int * interval '1 hour'))`.mapWith(
          Number,
        ),
        late: sql<number>`count(*) filter (where (${mentorshipRequests.status} = 'EXPIRED' and coalesce(${mentorshipRequests.expiryReason}, 'DEADLINE') <> 'MENTOR_INELIGIBLE') or (${mentorshipRequests.status} in ('ACCEPTED', 'DECLINED', 'REDIRECTED') and ${mentorshipRequests.decidedAt} is not null and ${mentorshipRequests.decidedAt} > ${mentorshipRequests.createdAt} + (${DECISION_WINDOW_HOURS}::int * interval '1 hour')))`.mapWith(
          Number,
        ),
      })
      .from(mentorshipRequests)
      .innerJoin(mentorProfiles, eq(mentorProfiles.id, mentorshipRequests.mentorProfileId))
      .innerJoin(users, eq(users.id, mentorProfiles.userId))
      .where(scope);

    const [outcomeTotals] = await this.db
      .select({
        reported: sql<number>`count(*)`.mapWith(Number),
        confirmed: sql<number>`count(*) filter (where ${outcomes.confirmedAt} is not null)`.mapWith(
          Number,
        ),
      })
      .from(outcomes)
      .innerJoin(mentorships, eq(mentorships.id, outcomes.mentorshipId))
      .innerJoin(mentorProfiles, eq(mentorProfiles.id, mentorships.mentorProfileId))
      .innerJoin(users, eq(users.id, mentorProfiles.userId))
      .where(scope);

    const byField = await this.db
      .select({
        fieldId: fields.id,
        fieldName: fields.name,
        counted: sql<number>`count(*)`.mapWith(Number),
      })
      .from(outcomes)
      .innerJoin(fields, eq(fields.id, outcomes.fieldId))
      .innerJoin(mentorships, eq(mentorships.id, outcomes.mentorshipId))
      .innerJoin(mentorProfiles, eq(mentorProfiles.id, mentorships.mentorProfileId))
      .innerJoin(users, eq(users.id, mentorProfiles.userId))
      .where(and(eq(outcomes.status, "COUNTED"), scope))
      .groupBy(fields.id, fields.name)
      .orderBy(asc(fields.name), asc(fields.id));

    return {
      verifiedAlumni: alumni?.value ?? 0,
      activeMentors: mentors?.value ?? 0,
      requestsReceived: requests?.received ?? 0,
      requestsAccepted: requests?.accepted ?? 0,
      requestsDecided: requests?.decided ?? 0,
      requestsDecidedInTime: requests?.inTime ?? 0,
      requestsLateOrExpired: requests?.late ?? 0,
      outcomesReported: outcomeTotals?.reported ?? 0,
      outcomesConfirmed: outcomeTotals?.confirmed ?? 0,
      countedOutcomesByField: byField.map((row) => ({
        fieldId: row.fieldId,
        fieldName: row.fieldName,
        counted: row.counted,
      })),
    };
  }
}
