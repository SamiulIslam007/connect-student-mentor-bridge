"use client";

import { useEffect, useState } from "react";

import { strings } from "../../lib/strings";

interface FieldSummary {
  id: string;
  name: string;
}

interface StudentProfile {
  goals: string;
  primary_field: FieldSummary;
  interest_fields: FieldSummary[];
  languages: string[];
}

interface MentorProfile {
  headline: string;
  bio: string;
  expertise_summary: string;
  scope_statement: string;
  primary_field: FieldSummary;
  fields: FieldSummary[];
  languages: string[];
  weekly_capacity: number;
}

interface MeResponse {
  student_profile: StudentProfile | null;
  mentor_profile: MentorProfile | null;
  roles?: string[];
}

interface Problem {
  code?: string;
  detail?: unknown;
}

const FIELD_LIST_ID = "field-options";

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Saved fields are rendered one per line, so the round-trip cannot split a name
 * that contains a comma (a single-line input cannot hold a newline).
 */
function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function logFailure(event: string, error: unknown): void {
  console.error(
    JSON.stringify({
      event,
      message: error instanceof Error ? error.message : "unknown error",
    }),
  );
}

function savedMessage(ok: boolean, payload: Problem | undefined): string | null {
  if (ok) {
    return null;
  }
  return typeof payload?.detail === "string" ? payload.detail : strings.profile.saveError;
}

export default function ProfilePage() {
  const [fields, setFields] = useState<FieldSummary[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [mentorRole, setMentorRole] = useState(false);

  const [studentGoals, setStudentGoals] = useState("");
  const [studentPrimary, setStudentPrimary] = useState("");
  const [studentInterest1, setStudentInterest1] = useState("");
  const [studentInterest2, setStudentInterest2] = useState("");
  const [studentLanguages, setStudentLanguages] = useState("");
  const [studentStatus, setStudentStatus] = useState<string | null>(null);

  const [mentorHeadline, setMentorHeadline] = useState("");
  const [mentorBio, setMentorBio] = useState("");
  const [mentorExpertise, setMentorExpertise] = useState("");
  const [mentorScope, setMentorScope] = useState("");
  const [mentorPrimary, setMentorPrimary] = useState("");
  const [mentorAdditional, setMentorAdditional] = useState("");
  const [mentorLanguages, setMentorLanguages] = useState("");
  const [mentorCapacity, setMentorCapacity] = useState("1");
  const [mentorStatus, setMentorStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const [meResponse, fieldsResponse] = await Promise.all([
          fetch("/api/me"),
          fetch("/api/fields"),
        ]);
        if (!active) {
          return;
        }
        if (meResponse.status === 401) {
          setSignedOut(true);
          setMessage(strings.profile.signedOut);
          return;
        }
        if (!meResponse.ok) {
          setMessage(strings.profile.loadError);
          return;
        }

        const me = (await meResponse.json()) as MeResponse;
        setMentorRole((me.roles ?? []).includes("MENTOR"));
        if (me.student_profile) {
          setStudentGoals(me.student_profile.goals);
          setStudentPrimary(me.student_profile.primary_field.name);
          setStudentInterest1(me.student_profile.interest_fields[0]?.name ?? "");
          setStudentInterest2(me.student_profile.interest_fields[1]?.name ?? "");
          setStudentLanguages(me.student_profile.languages.join(", "));
        }
        if (me.mentor_profile) {
          setMentorHeadline(me.mentor_profile.headline);
          setMentorBio(me.mentor_profile.bio);
          setMentorExpertise(me.mentor_profile.expertise_summary);
          setMentorScope(me.mentor_profile.scope_statement);
          setMentorPrimary(me.mentor_profile.primary_field.name);
          setMentorAdditional(me.mentor_profile.fields.map((field) => field.name).join("\n"));
          setMentorLanguages(me.mentor_profile.languages.join(", "));
          setMentorCapacity(String(me.mentor_profile.weekly_capacity));
        }

        if (fieldsResponse.ok) {
          const taxonomy = (await fieldsResponse.json()) as { fields?: FieldSummary[] };
          setFields(taxonomy.fields ?? []);
        } else {
          console.error(
            JSON.stringify({ event: "web.fields_fetch_failed", status: fieldsResponse.status }),
          );
          setMessage(strings.profile.fieldsUnavailable);
        }
      } catch (error) {
        logFailure("web.profile_load_failed", error);
        if (active) {
          setMessage(strings.profile.loadError);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  async function saveStudent(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setStudentStatus(null);
    try {
      const response = await fetch("/api/me/student-profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goals: studentGoals,
          primary_field: studentPrimary,
          interest_fields: [studentInterest1, studentInterest2]
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0),
          languages: splitList(studentLanguages),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as Problem;
      setStudentStatus(
        response.ok ? strings.profile.studentSaved : savedMessage(false, payload),
      );
    } catch (error) {
      logFailure("web.student_profile_save_failed", error);
      setStudentStatus(strings.profile.saveError);
    }
  }

  async function saveMentor(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setMentorStatus(null);
    try {
      const response = await fetch("/api/me/mentor-profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          headline: mentorHeadline,
          bio: mentorBio,
          expertise_summary: mentorExpertise,
          scope_statement: mentorScope,
          primary_field: mentorPrimary,
          fields: splitLines(mentorAdditional),
          languages: splitList(mentorLanguages),
          weekly_capacity: mentorCapacity === "" ? null : Number(mentorCapacity),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as Problem;
      // A stale page can still post without the role; recover through the opt-in
      // instead of showing a dead form (design D8).
      if (response.status === 403 && payload.code === "ROLE_REQUIRED") {
        setMentorRole(false);
        setMentorStatus(strings.profile.mentorRoleRequired);
        return;
      }
      setMentorStatus(response.ok ? strings.profile.mentorSaved : savedMessage(false, payload));
    } catch (error) {
      logFailure("web.mentor_profile_save_failed", error);
      setMentorStatus(strings.profile.saveError);
    }
  }

  async function becomeMentor(): Promise<void> {
    setMentorStatus(null);
    try {
      const response = await fetch("/api/me/roles/mentor", { method: "POST" });
      if (!response.ok) {
        setMentorStatus(strings.profile.mentorRoleError);
        return;
      }
      setMentorRole(true);
      setMentorStatus(strings.profile.mentorRoleGranted);
    } catch (error) {
      logFailure("web.mentor_role_grant_failed", error);
      setMentorStatus(strings.profile.mentorRoleError);
    }
  }

  return (
    <main>
      <h1>{strings.profile.title}</h1>
      <p>{strings.profile.intro}</p>

      <datalist id={FIELD_LIST_ID}>
        {fields.map((field) => (
          <option key={field.id} value={field.name} />
        ))}
      </datalist>

      <p role="status">{message}</p>

      {signedOut ? null : (
        <>
          <section>
            <h2>{strings.profile.studentTitle}</h2>
            <form onSubmit={saveStudent}>
              <label>
                {strings.profile.goals}
                <textarea
                  value={studentGoals}
                  onChange={(event) => setStudentGoals(event.target.value)}
                  required
                />
              </label>
              <label>
                {strings.profile.primaryField}
                <input
                  list={FIELD_LIST_ID}
                  value={studentPrimary}
                  onChange={(event) => setStudentPrimary(event.target.value)}
                  required
                />
              </label>
              <label>
                {strings.profile.interestField}
                <input
                  list={FIELD_LIST_ID}
                  value={studentInterest1}
                  onChange={(event) => setStudentInterest1(event.target.value)}
                />
              </label>
              <label>
                {strings.profile.interestField}
                <input
                  list={FIELD_LIST_ID}
                  value={studentInterest2}
                  onChange={(event) => setStudentInterest2(event.target.value)}
                />
              </label>
              <label>
                {strings.profile.languages}
                <input
                  value={studentLanguages}
                  onChange={(event) => setStudentLanguages(event.target.value)}
                />
              </label>
              <button type="submit">{strings.profile.saveStudent}</button>
            </form>
            <p role="status">{studentStatus}</p>
          </section>

          <section>
            <h2>{strings.profile.mentorTitle}</h2>
            {mentorRole ? null : (
              <div>
                <p>{strings.profile.becomeMentorIntro}</p>
                <button type="button" onClick={() => void becomeMentor()}>
                  {strings.profile.becomeMentor}
                </button>
              </div>
            )}
            <form onSubmit={saveMentor}>
              {/* The role is the gate: the fields stay visible but not editable. */}
              <fieldset disabled={!mentorRole} style={{ border: 0, padding: 0, margin: 0 }}>
              <label>
                {strings.profile.headline}
                <input
                  value={mentorHeadline}
                  onChange={(event) => setMentorHeadline(event.target.value)}
                  required
                />
              </label>
              <label>
                {strings.profile.bio}
                <textarea
                  value={mentorBio}
                  onChange={(event) => setMentorBio(event.target.value)}
                  required
                />
              </label>
              <label>
                {strings.profile.expertiseSummary}
                <textarea
                  value={mentorExpertise}
                  onChange={(event) => setMentorExpertise(event.target.value)}
                  required
                />
              </label>
              <label>
                {strings.profile.scopeStatement}
                <textarea
                  value={mentorScope}
                  onChange={(event) => setMentorScope(event.target.value)}
                  required
                />
              </label>
              <label>
                {strings.profile.primaryField}
                <input
                  list={FIELD_LIST_ID}
                  value={mentorPrimary}
                  onChange={(event) => setMentorPrimary(event.target.value)}
                  required
                />
              </label>
              <label>
                {strings.profile.additionalFields}
                <textarea
                  rows={3}
                  value={mentorAdditional}
                  onChange={(event) => setMentorAdditional(event.target.value)}
                />
              </label>
              <label>
                {strings.profile.languages}
                <input
                  value={mentorLanguages}
                  onChange={(event) => setMentorLanguages(event.target.value)}
                />
              </label>
              <label>
                {strings.profile.weeklyCapacity}
                <input
                  type="number"
                  min={1}
                  max={5}
                  step={1}
                  value={mentorCapacity}
                  onChange={(event) => setMentorCapacity(event.target.value)}
                  required
                />
              </label>
              <button type="submit">{strings.profile.saveMentor}</button>
              </fieldset>
            </form>
            <p role="status">{mentorStatus}</p>
          </section>
        </>
      )}

      <p>
        <a href="/account">{strings.profile.backToAccount}</a>
      </p>
    </main>
  );
}
