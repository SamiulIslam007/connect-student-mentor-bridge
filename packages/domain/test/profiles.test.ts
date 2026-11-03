import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MENTOR_FIELD_TOTAL_MAX,
  MENTOR_WEEKLY_CAPACITY_MAX,
  PROFILE_LANGUAGE_MAX,
  STUDENT_INTEREST_FIELD_MAX,
  distinctFieldNames,
  isValidWeeklyCapacity,
  normalizeLanguages,
  validateMentorProfileInput,
  validateStudentProfileInput,
  type MentorProfileDraft,
  type StudentProfileDraft,
} from "../src/index.js";

const student: StudentProfileDraft = {
  goals: "Become a backend engineer",
  primaryField: "Software engineering",
  interestFields: ["Distributed systems"],
  languages: ["en"],
};

const mentor: MentorProfileDraft = {
  headline: "Backend engineer at a payments company",
  bio: "Eight years building APIs.",
  expertiseSummary: "API design, databases, code review",
  scopeStatement: "I can review design docs, not write production code for you.",
  primaryField: "Software engineering",
  additionalFields: ["Databases"],
  languages: ["en"],
  weeklyCapacity: 2,
};

test("valid drafts produce no problems", () => {
  assert.deepEqual(validateStudentProfileInput(student), []);
  assert.deepEqual(validateMentorProfileInput(mentor), []);
});

test("required text must not be blank", () => {
  assert.ok(
    validateStudentProfileInput({ ...student, goals: "   " }).includes("goals is required"),
  );
  const blanks = validateMentorProfileInput({
    ...mentor,
    headline: " ",
    bio: "",
    expertiseSummary: "\t",
    scopeStatement: "",
  });
  assert.deepEqual(blanks, [
    "headline is required",
    "bio is required",
    "expertise_summary is required",
    "scope_statement is required",
  ]);
});

test("the primary field name is required and bounded", () => {
  assert.equal(validateStudentProfileInput({ ...student, primaryField: "  " }).length > 0, true);
  assert.equal(
    validateStudentProfileInput({ ...student, primaryField: "a".repeat(101) }).length > 0,
    true,
  );
  assert.deepEqual(validateStudentProfileInput({ ...student, primaryField: "a".repeat(100) }), []);
});

test("weekly capacity accepts only whole numbers from 1 to 5", () => {
  assert.equal(MENTOR_WEEKLY_CAPACITY_MAX, 5);
  for (const value of [1, 5]) {
    assert.equal(isValidWeeklyCapacity(value), true);
    assert.deepEqual(validateMentorProfileInput({ ...mentor, weeklyCapacity: value }), []);
  }
  for (const value of [0, 6, 2.5, "3", undefined, null]) {
    assert.equal(isValidWeeklyCapacity(value), false);
    assert.equal(
      validateMentorProfileInput({ ...mentor, weeklyCapacity: value }).length,
      1,
      `${String(value)} is refused`,
    );
  }
});

test("more than two distinct interest fields are refused", () => {
  assert.equal(STUDENT_INTEREST_FIELD_MAX, 2);
  const problems = validateStudentProfileInput({
    ...student,
    interestFields: ["A", "B", "C"],
  });
  assert.ok(problems.some((problem) => problem.includes("at most 2")));
});

test("an interest field may not repeat the primary field", () => {
  const problems = validateStudentProfileInput({
    ...student,
    primaryField: "Data science",
    interestFields: ["data-science"],
  });
  assert.ok(problems.some((problem) => problem.includes("repeat the primary field")));
});

test("duplicate interest fields collapse to one reference", () => {
  const collapsed = distinctFieldNames(["AI", "ai"]);
  assert.deepEqual(collapsed, ["AI"]);
  assert.deepEqual(
    validateStudentProfileInput({ ...student, interestFields: ["AI", "ai"] }),
    [],
  );
});

test("an additional field may not repeat the primary field", () => {
  const problems = validateMentorProfileInput({
    ...mentor,
    primaryField: "Data science",
    additionalFields: ["DATA SCIENCE"],
  });
  assert.ok(problems.some((problem) => problem.includes("repeat the primary field")));
});

test("language codes are case-folded and deduplicated", () => {
  assert.deepEqual(normalizeLanguages(["EN", "bn", "en", "  ", "Bn"]), ["en", "bn"]);
});

test("a mentor has at most five fields in total", () => {
  assert.equal(MENTOR_FIELD_TOTAL_MAX, 5);
  assert.deepEqual(
    validateMentorProfileInput({ ...mentor, additionalFields: ["A", "B", "C", "D"] }),
    [],
    "one primary plus four additional fields is accepted",
  );

  const refused = validateMentorProfileInput({
    ...mentor,
    additionalFields: ["A", "B", "C", "D", "E"],
  });
  assert.ok(refused.some((problem) => problem.includes("at most 5 fields")));

  assert.deepEqual(
    validateMentorProfileInput({ ...mentor, additionalFields: ["A", "a", "B", "C", "D"] }),
    [],
    "spellings of one field count once",
  );
});

test("languages are capped at five for both roles", () => {
  assert.equal(PROFILE_LANGUAGE_MAX, 5);
  const five = ["en", "bn", "hi", "ur", "fr"];
  assert.deepEqual(validateStudentProfileInput({ ...student, languages: five }), []);
  assert.deepEqual(validateMentorProfileInput({ ...mentor, languages: five }), []);

  const six = [...five, "de"];
  assert.ok(
    validateStudentProfileInput({ ...student, languages: six }).some((problem) =>
      problem.includes("at most 5 languages"),
    ),
  );
  assert.ok(
    validateMentorProfileInput({ ...mentor, languages: six }).some((problem) =>
      problem.includes("at most 5 languages"),
    ),
  );

  assert.deepEqual(
    validateStudentProfileInput({ ...student, languages: ["EN", "en", "bn"] }),
    [],
    "duplicates count once",
  );
});
