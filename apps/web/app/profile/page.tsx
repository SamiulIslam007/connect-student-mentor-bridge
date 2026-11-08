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
  access_mode?: string;
  status?: string;
  onboarding_status?: string;
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
  timezone?: string;
  student_profile: StudentProfile | null;
  mentor_profile: MentorProfile | null;
  roles?: string[];
  affiliations?: Affiliation[];
}

interface Affiliation {
  id: string;
  institution: { id: string; name: string | null } | null;
  kind: string;
  level: string;
  method: string;
  status: string;
  department: string | null;
  program: string | null;
  batch_year: number | null;
  verified_at: string | null;
  revoked_at: string | null;
}

interface AvailabilityWindow {
  weekday: number;
  start_minute: number;
  end_minute: number;
  timezone: string;
}

/** A form row: minutes are edited as `HH:MM` in the section's zone. */
interface DraftWindow {
  weekday: number;
  start: string;
  end: string;
}

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function toMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function toDraft(window: AvailabilityWindow): DraftWindow {
  return {
    weekday: window.weekday,
    start: toTime(window.start_minute),
    end: toTime(window.end_minute),
  };
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
  const [studentZone, setStudentZone] = useState("Asia/Dhaka");
  const [mentorZone, setMentorZone] = useState("Asia/Dhaka");
  const [studentWindows, setStudentWindows] = useState<DraftWindow[]>([]);
  const [mentorWindows, setMentorWindows] = useState<DraftWindow[]>([]);
  const [studentAvailabilityStatus, setStudentAvailabilityStatus] = useState<string | null>(null);
  const [mentorAvailabilityStatus, setMentorAvailabilityStatus] = useState<string | null>(null);
  const [accessMode, setAccessMode] = useState("OPEN");
  const [accessStatus, setAccessStatus] = useState<string | null>(null);

  const [affiliations, setAffiliations] = useState<Affiliation[]>([]);
  const [affiliationKind, setAffiliationKind] = useState("STUDENT");
  const [affiliationDepartment, setAffiliationDepartment] = useState("");
  const [affiliationProgram, setAffiliationProgram] = useState("");
  const [affiliationBatchYear, setAffiliationBatchYear] = useState("");
  const [affiliationStatus, setAffiliationStatus] = useState<string | null>(null);

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
  const [mentorProfileStatus, setMentorProfileStatus] = useState<string | null>(null);
  const [mentorOnboarding, setMentorOnboarding] = useState<string | null>(null);

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
        setAffiliations(me.affiliations ?? []);
        const zone = me.timezone ?? "Asia/Dhaka";
        setStudentZone(zone);
        setMentorZone(zone);
        if (me.mentor_profile?.access_mode) {
          setAccessMode(me.mentor_profile.access_mode);
        }

        // Availability is its own read: a refused save must never discard it.
        const [studentAvailability, mentorAvailability] = await Promise.all([
          fetch("/api/me/availability?context=STUDENT"),
          fetch("/api/me/availability?context=MENTOR"),
        ]);
        if (studentAvailability.ok) {
          const stored = (await studentAvailability.json()) as { windows?: AvailabilityWindow[] };
          setStudentWindows((stored.windows ?? []).map(toDraft));
        }
        if (mentorAvailability.ok) {
          const stored = (await mentorAvailability.json()) as { windows?: AvailabilityWindow[] };
          setMentorWindows((stored.windows ?? []).map(toDraft));
        }
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
          setMentorProfileStatus(me.mentor_profile.status ?? null);
          setMentorOnboarding(me.mentor_profile.onboarding_status ?? null);
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
          // A paused mentor stays paused: the save never names PAUSED.
          ...(accessMode === "PAUSED" ? {} : { access_mode: accessMode }),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as Problem & {
        status?: string;
        onboarding_status?: string;
      };
      // A stale page can still post without the role; recover through the opt-in
      // instead of showing a dead form (design D8).
      if (response.status === 403 && payload.code === "ROLE_REQUIRED") {
        setMentorRole(false);
        setMentorStatus(strings.profile.mentorRoleRequired);
        return;
      }
      if (response.ok) {
        setMentorProfileStatus(payload.status ?? mentorProfileStatus);
        setMentorOnboarding(payload.onboarding_status ?? mentorOnboarding);
      }
      setMentorStatus(response.ok ? strings.profile.mentorSaved : savedMessage(false, payload));
    } catch (error) {
      logFailure("web.mentor_profile_save_failed", error);
      setMentorStatus(strings.profile.saveError);
    }
  }

  async function saveAvailability(kind: "STUDENT" | "MENTOR"): Promise<void> {
    const rows = kind === "STUDENT" ? studentWindows : mentorWindows;
    const zone = kind === "STUDENT" ? studentZone : mentorZone;
    const setStatus =
      kind === "STUDENT" ? setStudentAvailabilityStatus : setMentorAvailabilityStatus;

    const windows = [];
    for (const row of rows) {
      const start = toMinutes(row.start);
      const end = toMinutes(row.end);
      if (start === null || end === null) {
        setStatus(strings.profile.availabilityError);
        return;
      }
      windows.push({ weekday: row.weekday, start_minute: start, end_minute: end, timezone: zone });
    }

    setStatus(null);
    try {
      const response = await fetch("/api/me/availability", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context: kind, windows }),
      });
      const payload = (await response.json().catch(() => ({}))) as Problem;
      if (!response.ok) {
        // Keep the entered rows and show the API's problem detail (spec: refused save).
        setStatus(typeof payload.detail === "string" ? payload.detail : strings.profile.availabilityError);
        return;
      }
      setStatus(strings.profile.availabilitySaved);
    } catch (error) {
      logFailure("web.availability_save_failed", error);
      setStatus(strings.profile.availabilityError);
    }
  }

  async function changeAccessMode(path: "pause" | "resume"): Promise<void> {
    setAccessStatus(null);
    try {
      const response = await fetch(`/api/me/mentor-profile/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: path === "resume" ? JSON.stringify({ access_mode: "OPEN" }) : undefined,
      });
      if (!response.ok) {
        setAccessStatus(strings.profile.accessModeError);
        return;
      }
      const payload = (await response.json()) as { access_mode?: string };
      setAccessMode(payload.access_mode ?? (path === "pause" ? "PAUSED" : "OPEN"));
      setAccessStatus(strings.profile.accessModeSaved);
    } catch (error) {
      logFailure("web.access_mode_failed", error);
      setAccessStatus(strings.profile.accessModeError);
    }
  }

  async function claimAffiliation(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setAffiliationStatus(null);
    try {
      const response = await fetch("/api/me/affiliations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: affiliationKind,
          department: affiliationDepartment,
          program: affiliationProgram,
          batch_year: affiliationBatchYear === "" ? undefined : Number(affiliationBatchYear),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as Problem & {
        affiliation?: { status?: string };
      };
      if (!response.ok) {
        setAffiliationStatus(
          payload.code === "AFFILIATION_INSTITUTION_MISMATCH"
            ? strings.profile.affiliationDomainMismatch
            : typeof payload.detail === "string"
              ? payload.detail
              : strings.profile.affiliationError,
        );
        return;
      }

      // Read the list back: a repeat claim returns the existing row unchanged.
      const meResponse = await fetch("/api/me");
      if (meResponse.ok) {
        const me = (await meResponse.json()) as MeResponse;
        setAffiliations(me.affiliations ?? []);
      }
      setAffiliationStatus(
        payload.affiliation?.status === "verified"
          ? strings.profile.affiliationClaimed
          : strings.profile.affiliationPending,
      );
    } catch (error) {
      logFailure("web.affiliation_claim_failed", error);
      setAffiliationStatus(strings.profile.affiliationError);
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
            <h2>{strings.profile.affiliationTitle}</h2>
            <p>{strings.profile.affiliationIntro}</p>
            {affiliations.length === 0 ? (
              <p>{strings.profile.affiliationNone}</p>
            ) : (
              <ul>
                {affiliations.map((affiliation) => (
                  <li key={affiliation.id}>
                    {affiliation.institution?.name ?? "—"} ·{" "}
                    {strings.profile.affiliationLevel} {affiliation.level} ·{" "}
                    {strings.profile.affiliationStatus} {affiliation.status}
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={claimAffiliation}>
              <label>
                {strings.profile.affiliationKind}
                <select
                  value={affiliationKind}
                  onChange={(event) => setAffiliationKind(event.target.value)}
                >
                  <option value="STUDENT">{strings.profile.affiliationStudent}</option>
                  <option value="ALUMNUS">{strings.profile.affiliationAlumnus}</option>
                  <option value="FACULTY_STAFF">{strings.profile.affiliationFacultyStaff}</option>
                  <option value="EMPLOYEE">{strings.profile.affiliationEmployee}</option>
                </select>
              </label>
              <label>
                {strings.profile.affiliationDepartment}
                <input
                  value={affiliationDepartment}
                  onChange={(event) => setAffiliationDepartment(event.target.value)}
                />
              </label>
              <label>
                {strings.profile.affiliationProgram}
                <input
                  value={affiliationProgram}
                  onChange={(event) => setAffiliationProgram(event.target.value)}
                />
              </label>
              <label>
                {strings.profile.affiliationBatchYear}
                <input
                  type="number"
                  min={1900}
                  max={2200}
                  step={1}
                  value={affiliationBatchYear}
                  onChange={(event) => setAffiliationBatchYear(event.target.value)}
                />
              </label>
              <button type="submit">{strings.profile.claimAffiliation}</button>
            </form>
            <p role="status">{affiliationStatus}</p>
          </section>

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
            <AvailabilityEditor
              windows={studentWindows}
              timezone={studentZone}
              status={studentAvailabilityStatus}
              onChange={setStudentWindows}
              onTimezone={setStudentZone}
              onSave={() => void saveAvailability("STUDENT")}
            />
          </section>

          <section>
            <h2>{strings.profile.mentorTitle}</h2>
            {mentorProfileStatus ? (
              <p>
                {strings.profile.mentorStatusLabel}: {mentorProfileStatus} ·{" "}
                {strings.profile.mentorOnboardingLabel}: {mentorOnboarding}
              </p>
            ) : null}
            {mentorProfileStatus && mentorProfileStatus !== "ACTIVE" ? (
              <p>{strings.profile.activationPending}</p>
            ) : null}
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
            <AvailabilityEditor
              windows={mentorWindows}
              timezone={mentorZone}
              status={mentorAvailabilityStatus}
              onChange={setMentorWindows}
              onTimezone={setMentorZone}
              onSave={() => void saveAvailability("MENTOR")}
            />
            {mentorRole ? (
              <div>
                <h3>{strings.profile.accessModeTitle}</h3>
                <p>{strings.profile.accessModeIntro}</p>
                <p>
                  <strong>
                    {accessMode === "PAUSED"
                      ? strings.profile.accessModePaused
                      : accessMode === "APPLICATION_ONLY"
                        ? strings.profile.accessModeApplicationOnly
                        : strings.profile.accessModeOpen}
                  </strong>
                </p>
                <label>
                  {strings.profile.accessModeLabel}
                  <select
                    value={accessMode}
                    disabled={accessMode === "PAUSED"}
                    onChange={(event) => setAccessMode(event.target.value)}
                  >
                    <option value="OPEN">{strings.profile.accessModeOpen}</option>
                    <option value="APPLICATION_ONLY">
                      {strings.profile.accessModeApplicationOnly}
                    </option>
                  </select>
                </label>
                <p>{strings.profile.applicationsNotBuilt}</p>
                {accessMode === "PAUSED" ? (
                  <button type="button" onClick={() => void changeAccessMode("resume")}>
                    {strings.profile.resume}
                  </button>
                ) : (
                  <button type="button" onClick={() => void changeAccessMode("pause")}>
                    {strings.profile.pause}
                  </button>
                )}
                <p role="status">{accessStatus}</p>
              </div>
            ) : null}
          </section>
        </>
      )}

      <p>
        <a href="/account">{strings.profile.backToAccount}</a>
      </p>
    </main>
  );
}

/**
 * The weekly-availability editor (design D7): its own save, so a refused
 * availability write never discards unsaved profile text.
 */
function AvailabilityEditor({
  windows,
  timezone,
  status,
  onChange,
  onTimezone,
  onSave,
}: {
  windows: DraftWindow[];
  timezone: string;
  status: string | null;
  onChange: (windows: DraftWindow[]) => void;
  onTimezone: (timezone: string) => void;
  onSave: () => void;
}) {
  return (
    <div>
      <h3>{strings.profile.availabilityTitle}</h3>
      <p>{strings.profile.availabilityIntro}</p>
      {windows.length === 0 ? <p>{strings.profile.availabilityEmpty}</p> : null}
      {windows.map((row, index) => (
        <div key={index}>
          <label>
            {strings.profile.weekday}
            <select
              value={row.weekday}
              onChange={(event) => {
                const next = [...windows];
                next[index] = { ...row, weekday: Number(event.target.value) };
                onChange(next);
              }}
            >
              {WEEKDAYS.map((day, dayIndex) => (
                <option key={day} value={dayIndex + 1}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label>
            {strings.profile.startTime}
            <input
              type="time"
              value={row.start}
              onChange={(event) => {
                const next = [...windows];
                next[index] = { ...row, start: event.target.value };
                onChange(next);
              }}
            />
          </label>
          <label>
            {strings.profile.endTime}
            <input
              type="time"
              value={row.end}
              onChange={(event) => {
                const next = [...windows];
                next[index] = { ...row, end: event.target.value };
                onChange(next);
              }}
            />
          </label>
          <button type="button" onClick={() => onChange(windows.filter((_, i) => i !== index))}>
            {strings.profile.removeWindow}
          </button>
        </div>
      ))}
      <p>
        <label>
          {strings.profile.timezone}
          <input value={timezone} onChange={(event) => onTimezone(event.target.value)} />
        </label>
      </p>
      <p>
        <button
          type="button"
          onClick={() => onChange([...windows, { weekday: 1, start: "09:00", end: "10:00" }])}
        >
          {strings.profile.addWindow}
        </button>
        <button type="button" onClick={onSave}>
          {strings.profile.saveAvailability}
        </button>
      </p>
      <p role="status">{status}</p>
    </div>
  );
}
