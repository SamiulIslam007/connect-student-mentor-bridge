import { Inject, Injectable } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";

import {
  IdentityError,
  distinctFieldNames,
  normalizeFieldName,
  normalizeLanguages,
  validateMentorProfileInput,
  validateStudentProfileInput,
} from "@connect/domain";

import { DATABASE } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import {
  fields,
  mentorFields,
  mentorProfiles,
  studentFieldInterests,
  studentProfiles,
} from "../db/schema/index.js";
import type {
  FieldSummary,
  MentorProfileRecord,
  OwnProfiles,
  ProfilesService,
  SaveMentorProfileInput,
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
): Promise<string> {
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
    .returning({ id: fields.id });
  if (!row) {
    throw new Error("the field upsert returned no row");
  }
  return row.id;
}

async function upsertFields(
  tx: Transaction,
  names: string[],
  userId: string,
): Promise<string[]> {
  const ids: string[] = [];
  for (const name of distinctFieldNames(names)) {
    const id = await upsertField(tx, name, userId);
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
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
      const primaryFieldId = await upsertField(tx, draft.primaryField, userId);
      const interestIds = await upsertFields(tx, draft.interestFields, userId);

      const [profile] = await tx
        .insert(studentProfiles)
        .values({ userId, goals, primaryFieldId, languages })
        .onConflictDoUpdate({
          target: studentProfiles.userId,
          set: { goals, primaryFieldId, languages, updatedAt: new Date() },
        })
        .returning({ id: studentProfiles.id });
      if (!profile) {
        throw new Error("the student profile upsert returned no row");
      }

      // Full replace: interests absent from this submission are removed.
      await tx
        .delete(studentFieldInterests)
        .where(eq(studentFieldInterests.studentProfileId, profile.id));
      if (interestIds.length > 0) {
        await tx.insert(studentFieldInterests).values(
          interestIds.map((fieldId) => ({ studentProfileId: profile.id, fieldId })),
        );
      }

      const [primaryField] = await tx
        .select({ id: fields.id, name: fields.name })
        .from(fields)
        .where(eq(fields.id, primaryFieldId));
      if (!primaryField) {
        throw new Error("the primary field disappeared inside its own transaction");
      }
      const interestFields = await this.readJoinFields(tx, "student", profile.id);

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
      // Unreachable after validation; keeps the domain rule as the only guard.
      throw new IdentityError("VALIDATION_ERROR", "weekly_capacity must be a number");
    }
    const languages = normalizeLanguages(draft.languages);

    return await this.db.transaction(async (tx) => {
      const primaryFieldId = await upsertField(tx, draft.primaryField, userId);
      const additionalFieldIds = await upsertFields(tx, draft.additionalFields, userId);

      const [profile] = await tx
        .insert(mentorProfiles)
        .values({
          userId,
          primaryFieldId,
          headline: draft.headline,
          bio: draft.bio,
          expertiseSummary: draft.expertiseSummary,
          scopeStatement: draft.scopeStatement,
          languages,
          weeklyCapacity,
        })
        .onConflictDoUpdate({
          target: mentorProfiles.userId,
          set: {
            primaryFieldId,
            headline: draft.headline,
            bio: draft.bio,
            expertiseSummary: draft.expertiseSummary,
            scopeStatement: draft.scopeStatement,
            languages,
            weeklyCapacity,
            updatedAt: new Date(),
          },
        })
        .returning({ id: mentorProfiles.id });
      if (!profile) {
        throw new Error("the mentor profile upsert returned no row");
      }

      await tx.delete(mentorFields).where(eq(mentorFields.mentorProfileId, profile.id));
      if (additionalFieldIds.length > 0) {
        await tx.insert(mentorFields).values(
          additionalFieldIds.map((fieldId) => ({ mentorProfileId: profile.id, fieldId })),
        );
      }

      const [primaryField] = await tx
        .select({ id: fields.id, name: fields.name })
        .from(fields)
        .where(eq(fields.id, primaryFieldId));
      if (!primaryField) {
        throw new Error("the primary field disappeared inside its own transaction");
      }
      const additionalFields = await this.readJoinFields(tx, "mentor", profile.id);

      return {
        headline: draft.headline,
        bio: draft.bio,
        expertiseSummary: draft.expertiseSummary,
        scopeStatement: draft.scopeStatement,
        primaryField,
        fields: additionalFields,
        languages,
        weeklyCapacity,
      };
    });
  }

  async listFields(): Promise<FieldSummary[]> {
    return await this.db
      .select({ id: fields.id, name: fields.name })
      .from(fields)
      .where(eq(fields.status, "ACTIVE"))
      .orderBy(asc(fields.name));
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
          interestFields: await this.readJoinFieldsForUser("student", student.id),
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
          fields: await this.readJoinFieldsForUser("mentor", mentor.id),
          languages: mentor.languages,
          weeklyCapacity: mentor.weeklyCapacity,
        }
      : null;

    return { studentProfile, mentorProfile };
  }

  /** Field rows of a join table, inside the save transaction or for `GET /v1/me`. */
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

  /** The same read outside a transaction, for `GET /v1/me`. */
  private async readJoinFieldsForUser(
    role: "student" | "mentor",
    profileId: string,
  ): Promise<FieldSummary[]> {
    return await this.readJoinFields(this.db, role, profileId);
  }
}
