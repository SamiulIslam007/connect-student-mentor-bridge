import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, inArray, ne, sql, type SQL } from "drizzle-orm";

import {
  IdentityError,
  distinctFieldNames,
  normalizeFieldName,
  normalizeLanguages,
  slotsInUse,
  validateMentorProfileInput,
  validateStudentProfileInput,
  type AvailabilityWindow,
  type MatchAffiliation,
} from "@connect/domain";

import { DATABASE } from "../db/database.module.js";
import { liveMentorshipCount } from "../mentorships/drizzle-mentorship.service.js";
import type { Database } from "../db/database.js";
import {
  affiliations,
  availabilityWindows,
  fields,
  mentorFields,
  mentorProfiles,
  mentorshipRequests,
  studentFieldInterests,
  studentProfiles,
  users,
} from "../db/schema/index.js";
import type {
  FieldPage,
  FieldSummary,
  ListFieldsInput,
  ListMentorsInput,
  MentorAccessState,
  MentorContext,
  MentorDirectoryCard,
  MentorDirectoryPage,
  MentorProfileRecord,
  OwnProfiles,
  ProfilesService,
  SaveMentorProfileInput,
  SetMentorAccessModeInput,
  SaveStudentProfileInput,
  StudentProfileRecord,
  SuggestionPool,
  SuggestionPoolCandidate,
} from "./profiles.service.js";
import { SUGGESTION_POOL_LIMIT } from "./profiles.service.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Anything that can run a select: the pooled database or a transaction. */
type SelectExecutor = Pick<Database, "select">;

/**
 * Creates the field when its slug is new and reuses the row otherwise. The
 * `do update` is a deliberate no-op: `do nothing` returns no row, and catching
 * `23505` would abort the surrounding transaction (design D3). The stored
 * display name is first-wins, so a later spelling never rewrites it.
 */
async function upsertField(
  tx: Transaction,
  name: string,
  userId: string,
): Promise<FieldSummary> {
  const [row] = await tx
    .insert(fields)
    .values({
      name: name.trim(),
      normalizedSlug: normalizeFieldName(name),
      createdByUserId: userId,
    })
    .onConflictDoUpdate({
      target: fields.normalizedSlug,
      set: { normalizedSlug: sql`excluded.normalized_slug` },
    })
    .returning({ id: fields.id, name: fields.name });
  if (!row) {
    throw new Error("the field upsert returned no row");
  }
  return row;
}

async function upsertFields(
  tx: Transaction,
  names: string[],
  userId: string,
): Promise<FieldSummary[]> {
  const result: FieldSummary[] = [];
  const seen = new Set<string>();
  for (const name of distinctFieldNames(names)) {
    const field = await upsertField(tx, name, userId);
    if (!seen.has(field.id)) {
      seen.add(field.id);
      result.push(field);
    }
  }
  return result;
}

function fieldSummary(id: string, name: string): FieldSummary {
  return { id, name };
}

/** A filter that needs derived state rescans pages; 20 × 50 is the pilot bound. */
const DIRECTORY_SCAN_LIMIT = 20;

function deriveAccessState(
  slots: number,
  weeklyCapacity: number,
  accessMode: "OPEN" | "APPLICATION_ONLY" | "PAUSED",
): MentorAccessState {
  if (slots >= weeklyCapacity) {
    return "full";
  }
  return accessMode === "APPLICATION_ONLY" ? "application_only" : "available";
}

/** Validation runs before the transaction opens, so a refused save writes nothing. */
function assertValid(problems: string[]): void {
  if (problems.length > 0) {
    throw new IdentityError("VALIDATION_ERROR", problems.join("; "));
  }
}

@Injectable()
export class DrizzleProfilesService implements ProfilesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async saveStudentProfile({
    userId,
    draft,
  }: SaveStudentProfileInput): Promise<StudentProfileRecord> {
    assertValid(validateStudentProfileInput(draft));

    const goals = draft.goals;
    const languages = normalizeLanguages(draft.languages);

    return await this.db.transaction(async (tx) => {
      const primaryField = await upsertField(tx, draft.primaryField, userId);
      const interestFields = await upsertFields(tx, draft.interestFields, userId);

      const [profile] = await tx
        .insert(studentProfiles)
        .values({ userId, goals, primaryFieldId: primaryField.id, languages })
        .onConflictDoUpdate({
          target: studentProfiles.userId,
          set: { goals, primaryFieldId: primaryField.id, languages, updatedAt: new Date() },
        })
        .returning({ id: studentProfiles.id });
      if (!profile) {
        throw new Error("the student profile upsert returned no row");
      }

      // Full replace: interests absent from this submission are removed.
      await tx
        .delete(studentFieldInterests)
        .where(eq(studentFieldInterests.studentProfileId, profile.id));
      if (interestFields.length > 0) {
        await tx.insert(studentFieldInterests).values(
          interestFields.map((field) => ({
            studentProfileId: profile.id,
            fieldId: field.id,
          })),
        );
      }

      return { goals, primaryField, interestFields, languages };
    });
  }

  async saveMentorProfile({
    userId,
    draft,
  }: SaveMentorProfileInput): Promise<MentorProfileRecord> {
    assertValid(validateMentorProfileInput(draft));

    const weeklyCapacity = draft.weeklyCapacity;
    if (typeof weeklyCapacity !== "number") {
      // Unreachable after validation; validation stays the single rule.
      throw new IdentityError("VALIDATION_ERROR", "weekly_capacity must be a number");
    }
    const languages = normalizeLanguages(draft.languages);
    const accessMode = draft.accessMode;

    return await this.db.transaction(async (tx) => {
      const primaryField = await upsertField(tx, draft.primaryField, userId);
      const additionalFields = await upsertFields(tx, draft.additionalFields, userId);

      const [profile] = await tx
        .insert(mentorProfiles)
        .values({
          userId,
          primaryFieldId: primaryField.id,
          headline: draft.headline,
          bio: draft.bio,
          expertiseSummary: draft.expertiseSummary,
          scopeStatement: draft.scopeStatement,
          languages,
          weeklyCapacity,
          accessMode: accessMode ?? "OPEN",
        })
        .onConflictDoUpdate({
          target: mentorProfiles.userId,
          set: {
            primaryFieldId: primaryField.id,
            headline: draft.headline,
            bio: draft.bio,
            expertiseSummary: draft.expertiseSummary,
            scopeStatement: draft.scopeStatement,
            languages,
            weeklyCapacity,
            // Absent means "leave the stored mode alone", so an old client cannot
            // accidentally unpause a mentor (design D3).
            ...(accessMode ? { accessMode } : {}),
            updatedAt: new Date(),
          },
        })
        .returning({
          id: mentorProfiles.id,
          accessMode: mentorProfiles.accessMode,
          status: mentorProfiles.status,
          onboardingStatus: mentorProfiles.onboardingStatus,
        });
      if (!profile) {
        throw new Error("the mentor profile upsert returned no row");
      }

      await tx.delete(mentorFields).where(eq(mentorFields.mentorProfileId, profile.id));
      if (additionalFields.length > 0) {
        await tx.insert(mentorFields).values(
          additionalFields.map((field) => ({
            mentorProfileId: profile.id,
            fieldId: field.id,
          })),
        );
      }

      return {
        headline: draft.headline,
        bio: draft.bio,
        expertiseSummary: draft.expertiseSummary,
        scopeStatement: draft.scopeStatement,
        primaryField,
        fields: additionalFields,
        languages,
        weeklyCapacity,
        // The stored mode, not the draft: an absent field leaves it alone.
        accessMode: profile.accessMode,
        status: profile.status,
        onboardingStatus: profile.onboardingStatus,
      };
    });
  }

  /** Idempotent: setting the mode it already has is a success (design D4). */
  async setMentorAccessMode({
    userId,
    accessMode,
  }: SetMentorAccessModeInput): Promise<MentorProfileRecord> {
    await this.db.transaction(async (tx) => {
      // The row lock serializes a resume against a concurrent acceptance.
      const [current] = await tx
        .select({
          id: mentorProfiles.id,
          accessMode: mentorProfiles.accessMode,
          weeklyCapacity: mentorProfiles.weeklyCapacity,
        })
        .from(mentorProfiles)
        .where(eq(mentorProfiles.userId, userId))
        .for("update")
        .limit(1);
      if (!current) {
        throw new IdentityError(
          "VALIDATION_ERROR",
          "a mentor profile is required before the access mode can change",
        );
      }

      // Pausing is never a capacity decision; resuming from PAUSED is (design D7).
      if (current.accessMode === "PAUSED" && accessMode !== "PAUSED") {
        const live = await liveMentorshipCount(tx, current.id);
        if (live >= current.weeklyCapacity) {
          throw new IdentityError(
            "CAPACITY_BELOW_ACTIVE",
            `resuming needs a free mentoring slot: ${live} live mentorships and a weekly capacity of ${current.weeklyCapacity}`,
          );
        }
      }

      await tx
        .update(mentorProfiles)
        .set({ accessMode, updatedAt: new Date() })
        .where(eq(mentorProfiles.userId, userId));
    });

    const { mentorProfile } = await this.readProfiles(userId);
    if (!mentorProfile) {
      throw new Error("the mentor profile disappeared during the access-mode change");
    }
    return mentorProfile;
  }

  async readMentorContext(mentorProfileId: string): Promise<MentorContext | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mentorProfileId)) {
      return null;
    }
    const [row] = await this.db
      .select({
        id: mentorProfiles.id,
        displayName: users.name,
        headline: mentorProfiles.headline,
        accessMode: mentorProfiles.accessMode,
        status: mentorProfiles.status,
        primaryFieldId: mentorProfiles.primaryFieldId,
        primaryFieldName: fields.name,
      })
      .from(mentorProfiles)
      .innerJoin(users, eq(users.id, mentorProfiles.userId))
      .innerJoin(fields, eq(fields.id, mentorProfiles.primaryFieldId))
      .where(eq(mentorProfiles.id, mentorProfileId))
      .limit(1);
    if (!row || row.status !== "ACTIVE") {
      // Draft and pending mentors are not requestable and stay invisible.
      return null;
    }
    return {
      id: row.id,
      displayName: row.displayName,
      headline: row.headline,
      accessMode: row.accessMode,
      status: row.status,
      primaryField: fieldSummary(row.primaryFieldId, row.primaryFieldName),
    };
  }

  /**
   * The public directory (design D4): one keyset page of ACTIVE, non-paused
   * mentors, with `FULL` derived from the same `slotsInUse` rule the request
   * path uses. A scan cap keeps an access-state filter bounded; the pilot
   * directory is small, so it is a shortcut and not a paging strategy.
   */
  async listMentors({
    field,
    language,
    accessState,
    cursor,
    limit,
  }: ListMentorsInput): Promise<MentorDirectoryPage> {
    const collected: MentorDirectoryCard[] = [];
    let after = cursor;
    let hasMore = false;

    for (let scan = 0; scan < DIRECTORY_SCAN_LIMIT; scan += 1) {
      const conditions: SQL[] = [
        eq(mentorProfiles.status, "ACTIVE"),
        // A paused mentor is hidden from every filter (FR-PROF-02).
        ne(mentorProfiles.accessMode, "PAUSED"),
      ];
      if (after) {
        conditions.push(gt(mentorProfiles.id, after));
      }
      if (field) {
        conditions.push(sql`(
          ${mentorProfiles.primaryFieldId} = ${field}::uuid
          OR EXISTS (
            SELECT 1 FROM mentor_fields mf
            WHERE mf.mentor_profile_id = ${mentorProfiles.id} AND mf.field_id = ${field}::uuid
          )
        )`);
      }
      if (language) {
        conditions.push(sql`EXISTS (
          SELECT 1 FROM unnest(${mentorProfiles.languages}) AS stored
          WHERE lower(stored) = lower(${language})
        )`);
      }

      const rows = await this.db
        .select({
          id: mentorProfiles.id,
          displayName: users.name,
          headline: mentorProfiles.headline,
          accessMode: mentorProfiles.accessMode,
          languages: mentorProfiles.languages,
          weeklyCapacity: mentorProfiles.weeklyCapacity,
          primaryFieldId: mentorProfiles.primaryFieldId,
          primaryFieldName: fields.name,
        })
        .from(mentorProfiles)
        .innerJoin(users, eq(users.id, mentorProfiles.userId))
        .innerJoin(fields, eq(fields.id, mentorProfiles.primaryFieldId))
        .where(and(...conditions))
        .orderBy(asc(mentorProfiles.id))
        .limit(limit + 1);

      const ids = rows.map((row) => row.id);
      const [slots, additional] = await Promise.all([
        this.readSlotsInUse(ids),
        this.readMentorFields(ids),
      ]);

      for (const row of rows) {
        const counts = slots.get(row.id) ?? { pending: 0, acceptedInWindow: 0 };
        const card: MentorDirectoryCard = {
          id: row.id,
          displayName: row.displayName,
          headline: row.headline,
          accessState: deriveAccessState(
            slotsInUse(counts),
            row.weeklyCapacity,
            row.accessMode,
          ),
          accessMode: row.accessMode,
          primaryField: fieldSummary(row.primaryFieldId, row.primaryFieldName),
          fields: additional.get(row.id) ?? [],
          languages: row.languages,
        };
        if (!accessState || card.accessState === accessState) {
          collected.push(card);
        }
      }

      if (collected.length > limit) {
        hasMore = true;
        break;
      }
      if (rows.length <= limit) {
        break;
      }
      after = rows[rows.length - 1]?.id ?? after;
    }

    const page = collected.slice(0, limit);
    return { cards: page, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null };
  }

  /**
   * The suggestion pool (design R2): one bounded scan under the directory's own
   * conditions, the same capacity aggregate, plus the affiliation, availability
   * and request counts the score reads. The caller's own mentor profile is
   * excluded in the query so a dual-role account can never suggest itself.
   */
  async readSuggestionPool({ userId }: { userId: string }): Promise<SuggestionPool> {
    const [student] = await this.db
      .select({ id: studentProfiles.id, primaryFieldId: studentProfiles.primaryFieldId })
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, userId))
      .limit(1);
    if (!student) {
      return { student: null, candidates: [] };
    }

    const [interests, studentAffiliation, studentAvailability] = await Promise.all([
      this.readJoinFields(this.db, "student", student.id),
      this.readVerifiedAffiliation(userId),
      this.readAvailability([userId], "STUDENT"),
    ]);

    const rows = await this.db
      .select({
        id: mentorProfiles.id,
        userId: mentorProfiles.userId,
        displayName: users.name,
        headline: mentorProfiles.headline,
        accessMode: mentorProfiles.accessMode,
        languages: mentorProfiles.languages,
        weeklyCapacity: mentorProfiles.weeklyCapacity,
        primaryFieldId: mentorProfiles.primaryFieldId,
        primaryFieldName: fields.name,
      })
      .from(mentorProfiles)
      .innerJoin(users, eq(users.id, mentorProfiles.userId))
      .innerJoin(fields, eq(fields.id, mentorProfiles.primaryFieldId))
      .where(
        and(
          eq(mentorProfiles.status, "ACTIVE"),
          ne(mentorProfiles.accessMode, "PAUSED"),
          ne(mentorProfiles.userId, userId),
        ),
      )
      .orderBy(asc(mentorProfiles.id))
      .limit(SUGGESTION_POOL_LIMIT);

    const ids = rows.map((row) => row.id);
    const mentorUserIds = rows.map((row) => row.userId);
    const [slots, additional, mentorAffiliations, mentorAvailability, requests] =
      await Promise.all([
        this.readSlotsInUse(ids),
        this.readMentorFields(ids),
        this.readVerifiedAffiliations(mentorUserIds),
        this.readAvailability(mentorUserIds, "MENTOR"),
        this.readRequestsInWindow(ids),
      ]);

    const candidates: SuggestionPoolCandidate[] = rows.map((row) => {
      const counts = slots.get(row.id) ?? { pending: 0, acceptedInWindow: 0 };
      const used = slotsInUse(counts);
      const extra = additional.get(row.id) ?? [];
      return {
        id: row.id,
        displayName: row.displayName,
        headline: row.headline,
        accessState: deriveAccessState(used, row.weeklyCapacity, row.accessMode),
        accessMode: row.accessMode,
        primaryField: fieldSummary(row.primaryFieldId, row.primaryFieldName),
        fields: extra,
        languages: row.languages,
        fieldIds: [row.primaryFieldId, ...extra.map((field) => field.id)],
        affiliation: mentorAffiliations.get(row.userId) ?? null,
        availability: mentorAvailability.get(row.userId) ?? [],
        weeklyCapacity: row.weeklyCapacity,
        slotsInUse: used,
        requestsInWindow: requests.get(row.id) ?? 0,
      };
    });

    return {
      student: {
        id: student.id,
        userId,
        primaryFieldId: student.primaryFieldId,
        interestFieldIds: interests.map((field) => field.id),
        affiliation: studentAffiliation,
        availability: studentAvailability.get(userId) ?? [],
      },
      candidates,
    };
  }

  /** The single `VERIFIED` affiliation, which the alumni factor reads. */
  private async readVerifiedAffiliation(userId: string): Promise<MatchAffiliation | null> {
    const [row] = await this.db
      .select({
        institutionId: affiliations.institutionId,
        department: affiliations.department,
        batchYear: affiliations.batchYear,
      })
      .from(affiliations)
      .where(and(eq(affiliations.userId, userId), eq(affiliations.status, "VERIFIED")))
      .limit(1);
    if (!row?.institutionId) {
      return null;
    }
    return {
      institutionId: row.institutionId,
      department: row.department,
      batchYear: row.batchYear,
    };
  }

  /** One query for the page's verified affiliations, grouped in memory. */
  private async readVerifiedAffiliations(userIds: string[]): Promise<Map<string, MatchAffiliation>> {
    const grouped = new Map<string, MatchAffiliation>();
    if (userIds.length === 0) {
      return grouped;
    }
    const rows = await this.db
      .select({
        userId: affiliations.userId,
        institutionId: affiliations.institutionId,
        department: affiliations.department,
        batchYear: affiliations.batchYear,
      })
      .from(affiliations)
      .where(and(inArray(affiliations.userId, userIds), eq(affiliations.status, "VERIFIED")));

    for (const row of rows) {
      if (row.institutionId) {
        grouped.set(row.userId, {
          institutionId: row.institutionId,
          department: row.department,
          batchYear: row.batchYear,
        });
      }
    }
    return grouped;
  }

  /** One query for a set of accounts' weekly windows, grouped in memory. */
  private async readAvailability(
    userIds: string[],
    context: "STUDENT" | "MENTOR",
  ): Promise<Map<string, AvailabilityWindow[]>> {
    const grouped = new Map<string, AvailabilityWindow[]>();
    if (userIds.length === 0) {
      return grouped;
    }
    const rows = await this.db
      .select({
        userId: availabilityWindows.userId,
        weekday: availabilityWindows.weekday,
        startMinute: availabilityWindows.startMinute,
        endMinute: availabilityWindows.endMinute,
        timezone: availabilityWindows.timezone,
      })
      .from(availabilityWindows)
      .where(
        and(
          inArray(availabilityWindows.userId, userIds),
          eq(availabilityWindows.context, context),
        ),
      )
      .orderBy(asc(availabilityWindows.weekday), asc(availabilityWindows.startMinute));

    for (const row of rows) {
      const list = grouped.get(row.userId) ?? [];
      list.push({
        weekday: row.weekday,
        startMinute: row.startMinute,
        endMinute: row.endMinute,
        timezone: row.timezone,
      });
      grouped.set(row.userId, list);
    }
    return grouped;
  }

  /** Requests received inside the rolling capacity window, per mentor profile. */
  private async readRequestsInWindow(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({
        mentorProfileId: mentorshipRequests.mentorProfileId,
        received: sql<number>`(count(*) FILTER (
          WHERE ${mentorshipRequests.createdAt} > now() - interval '7 days'
        ))::int`,
      })
      .from(mentorshipRequests)
      .where(inArray(mentorshipRequests.mentorProfileId, ids))
      .groupBy(mentorshipRequests.mentorProfileId);

    return new Map(rows.map((row) => [row.mentorProfileId, Number(row.received)]));
  }

  /** One aggregate for the whole page: pending plus accepted inside seven days. */
  private async readSlotsInUse(
    ids: string[],
  ): Promise<Map<string, { pending: number; acceptedInWindow: number }>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({
        mentorProfileId: mentorshipRequests.mentorProfileId,
        pending: sql<number>`(count(*) FILTER (WHERE ${mentorshipRequests.status} = 'PENDING'))::int`,
        acceptedInWindow: sql<number>`(count(*) FILTER (
          WHERE ${mentorshipRequests.status} = 'ACCEPTED'
            AND ${mentorshipRequests.decidedAt} > now() - interval '7 days'
        ))::int`,
      })
      .from(mentorshipRequests)
      .where(inArray(mentorshipRequests.mentorProfileId, ids))
      .groupBy(mentorshipRequests.mentorProfileId);

    return new Map(
      rows.map((row) => [
        row.mentorProfileId,
        { pending: Number(row.pending), acceptedInWindow: Number(row.acceptedInWindow) },
      ]),
    );
  }

  /** One query for the page's additional fields, grouped in memory (no N+1). */
  private async readMentorFields(ids: string[]): Promise<Map<string, FieldSummary[]>> {
    const grouped = new Map<string, FieldSummary[]>();
    if (ids.length === 0) {
      return grouped;
    }
    const rows = await this.db
      .select({ mentorProfileId: mentorFields.mentorProfileId, id: fields.id, name: fields.name })
      .from(mentorFields)
      .innerJoin(fields, eq(fields.id, mentorFields.fieldId))
      .where(inArray(mentorFields.mentorProfileId, ids))
      .orderBy(asc(fields.name));

    for (const row of rows) {
      const list = grouped.get(row.mentorProfileId) ?? [];
      list.push({ id: row.id, name: row.name });
      grouped.set(row.mentorProfileId, list);
    }
    return grouped;
  }

  async listFields({ limit, cursor }: ListFieldsInput): Promise<FieldPage> {
    // Keyset pagination by slug: stable while fields are created, and bounded
    // even though the taxonomy is user-created (design D9).
    const active = eq(fields.status, "ACTIVE");
    const rows = await this.db
      .select({ id: fields.id, name: fields.name, slug: fields.normalizedSlug })
      .from(fields)
      .where(cursor ? and(active, gt(fields.normalizedSlug, cursor)) : active)
      .orderBy(asc(fields.normalizedSlug))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      fields: page.map((row) => ({ id: row.id, name: row.name })),
      nextCursor: hasMore ? page[page.length - 1].slug : null,
    };
  }

  async readProfiles(userId: string): Promise<OwnProfiles> {
    const [student] = await this.db
      .select({
        id: studentProfiles.id,
        goals: studentProfiles.goals,
        languages: studentProfiles.languages,
        primaryFieldId: studentProfiles.primaryFieldId,
        primaryFieldName: fields.name,
      })
      .from(studentProfiles)
      .innerJoin(fields, eq(fields.id, studentProfiles.primaryFieldId))
      .where(eq(studentProfiles.userId, userId))
      .limit(1);

    const studentProfile = student
      ? {
          goals: student.goals,
          primaryField: fieldSummary(student.primaryFieldId, student.primaryFieldName),
          interestFields: await this.readJoinFields(this.db, "student", student.id),
          languages: student.languages,
        }
      : null;

    const [mentor] = await this.db
      .select({
        id: mentorProfiles.id,
        headline: mentorProfiles.headline,
        bio: mentorProfiles.bio,
        expertiseSummary: mentorProfiles.expertiseSummary,
        scopeStatement: mentorProfiles.scopeStatement,
        languages: mentorProfiles.languages,
        weeklyCapacity: mentorProfiles.weeklyCapacity,
        accessMode: mentorProfiles.accessMode,
        status: mentorProfiles.status,
        onboardingStatus: mentorProfiles.onboardingStatus,
        primaryFieldId: mentorProfiles.primaryFieldId,
        primaryFieldName: fields.name,
      })
      .from(mentorProfiles)
      .innerJoin(fields, eq(fields.id, mentorProfiles.primaryFieldId))
      .where(eq(mentorProfiles.userId, userId))
      .limit(1);

    const mentorProfile = mentor
      ? {
          headline: mentor.headline,
          bio: mentor.bio,
          expertiseSummary: mentor.expertiseSummary,
          scopeStatement: mentor.scopeStatement,
          primaryField: fieldSummary(mentor.primaryFieldId, mentor.primaryFieldName),
          fields: await this.readJoinFields(this.db, "mentor", mentor.id),
          languages: mentor.languages,
          weeklyCapacity: mentor.weeklyCapacity,
          accessMode: mentor.accessMode,
          status: mentor.status,
          onboardingStatus: mentor.onboardingStatus,
        }
      : null;

    return { studentProfile, mentorProfile };
  }

  /** The field rows of a profile's join table, sorted by display name. */
  private async readJoinFields(
    executor: SelectExecutor,
    role: "student" | "mentor",
    profileId: string,
  ): Promise<FieldSummary[]> {
    if (role === "student") {
      return await executor
        .select({ id: fields.id, name: fields.name })
        .from(studentFieldInterests)
        .innerJoin(fields, eq(fields.id, studentFieldInterests.fieldId))
        .where(eq(studentFieldInterests.studentProfileId, profileId))
        .orderBy(asc(fields.name));
    }
    return await executor
      .select({ id: fields.id, name: fields.name })
      .from(mentorFields)
      .innerJoin(fields, eq(fields.id, mentorFields.fieldId))
      .where(eq(mentorFields.mentorProfileId, profileId))
      .orderBy(asc(fields.name));
  }
}
