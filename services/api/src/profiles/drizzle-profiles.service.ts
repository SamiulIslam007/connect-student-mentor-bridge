import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, sql } from "drizzle-orm";

import {
  IdentityError,
  distinctFieldNames,
  normalizeFieldName,
  normalizeLanguages,
  validateMentorProfileInput,
  validateStudentProfileInput,
} from "@connect/domain";

import { DATABASE } from "../db/database.module.js";
import { liveMentorshipCount } from "../mentorships/drizzle-mentorship.service.js";
import type { Database } from "../db/database.js";
import {
  fields,
  mentorFields,
  mentorProfiles,
  studentFieldInterests,
  studentProfiles,
  users,
} from "../db/schema/index.js";
import type {
  FieldPage,
  FieldSummary,
  ListFieldsInput,
  MentorContext,
  MentorProfileRecord,
  OwnProfiles,
  ProfilesService,
  SaveMentorProfileInput,
  SetMentorAccessModeInput,
  SaveStudentProfileInput,
  StudentProfileRecord,
} from "./profiles.service.js";

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
