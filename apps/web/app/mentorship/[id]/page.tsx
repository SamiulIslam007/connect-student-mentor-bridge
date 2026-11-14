"use client";

import { useCallback, useEffect, useState } from "react";

import {
  agreementState,
  cadenceLabel,
  canCompleteMentorship,
  canConfirmSession,
  composeMessage,
  mentorshipStatusLabel,
  pageState,
  pageStateMessage,
  sessionStatusLabel,
} from "../../../lib/mentorship-view";
import { strings } from "../../../lib/strings";
import { REPORT_REASON_OPTIONS, showReportControl } from "../../../lib/reports";
import { OutcomeSection } from "./outcome-section";
import { csrfFetch } from "../../../lib/csrf-client";

interface SessionRecord {
  id: string;
  scheduled_start: string;
  duration_minutes: number;
  meeting_url: string;
  status: string;
  student_confirmed_held_at: string | null;
  mentor_confirmed_held_at: string | null;
}

interface MentorshipRecord {
  id: string;
  status: string;
  cadence: string | null;
  planned_weeks: number | null;
  goal: string | null;
  student_acknowledged_at: string | null;
  mentor_acknowledged_at: string | null;
  agreement_acknowledged: boolean;
  question: string;
  student_name: string;
  mentor_name: string;
  viewer_role?: "student" | "mentor";
  sessions: SessionRecord[];
}

interface MessageRecord {
  id: string;
  sender_name: string;
  body: string;
  created_at: string;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 16).replace("T", " ");
}

export default function MentorshipPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null);
  const [mentorship, setMentorship] = useState<MentorshipRecord | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [cadence, setCadence] = useState("");
  const [plannedWeeks, setPlannedWeeks] = useState("");
  const [goal, setGoal] = useState("");
  const [start, setStart] = useState("");
  const [duration, setDuration] = useState("45");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportNotice, setReportNotice] = useState<string | null>(null);

  useEffect(() => {
    void params.then((value) => setId(value.id));
  }, [params]);

  const load = useCallback(async (mentorshipId: string): Promise<void> => {
    try {
      const detail = await fetch(`/api/mentorships/${mentorshipId}`);
      if (detail.status === 401) {
        setSignedOut(true);
        return;
      }
      if (detail.status === 404) {
        setNotFound(true);
        return;
      }
      if (!detail.ok) {
        setFailed(true);
        return;
      }
      const record = (await detail.json()) as MentorshipRecord;
      setMentorship(record);
      setCadence(record.cadence ?? "");
      setPlannedWeeks(record.planned_weeks ? String(record.planned_weeks) : "");
      setGoal(record.goal ?? "");

      const thread = await fetch(`/api/mentorships/${mentorshipId}/messages?limit=50`);
      if (thread.ok) {
        const payload = (await thread.json()) as { data?: MessageRecord[] };
        setMessages(payload.data ?? []);
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "web.mentorship_load_failed",
          message: error instanceof Error ? error.message : "unknown error",
        }),
      );
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (id) {
      void load(id);
    }
  }, [id, load]);

  async function post(path: string, body?: unknown, method = "POST"): Promise<boolean> {
    if (!id) {
      return false;
    }
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      const response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) {
        setProblem(strings.mentorship.actionError);
        return false;
      }
      await load(id);
      return true;
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "web.mentorship_action_failed",
          message: error instanceof Error ? error.message : "unknown error",
        }),
      );
      setProblem(strings.mentorship.actionError);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function send(): Promise<void> {
    const composed = composeMessage(draft);
    if (!composed.ok) {
      setProblem(composed.message);
      return;
    }
    if (!id) {
      return;
    }
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      const response = await csrfFetch(`/api/mentorships/${id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: composed.body }),
      });
      if (!response.ok) {
        // The typed text is kept so a refusal never loses the message.
        setProblem(
          response.status === 422 ? strings.mentorship.messageTooLong : strings.mentorship.sendError,
        );
        return;
      }
      setDraft("");
      setNotice(strings.mentorship.sent);
      await load(id);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "web.mentorship_send_failed",
          message: error instanceof Error ? error.message : "unknown error",
        }),
      );
      setProblem(strings.mentorship.sendError);
    } finally {
      setBusy(false);
    }
  }

  const state = pageState({ signedOut, notFound, failed, loaded });
  const stateMessage = pageStateMessage(state);
  const isParticipant = state === "ready" && mentorship !== null;

  async function sendReport(): Promise<void> {
    if (!reportMessageId) {
      return;
    }
    if (!reportReason) {
      setReportNotice(strings.report.reasonRequired);
      return;
    }
    setBusy(true);
    try {
      const details = reportDetails.trim();
      const response = await csrfFetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target_kind: "message",
          target_id: reportMessageId,
          reason: reportReason,
          ...(details ? { details } : {}),
        }),
      });
      if (!response.ok) {
        setReportNotice(strings.report.failed);
        return;
      }
      setReportMessageId(null);
      setReportDetails("");
      setReportReason("");
      setReportNotice(strings.report.sent);
    } catch {
      setReportNotice(strings.report.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>{strings.mentorship.title}</h1>
      <p role="status">{stateMessage ?? notice}</p>
      <p role="alert">{problem}</p>

      {isParticipant ? (
        <>
          <section>
            <h2>{strings.mentorship.question}</h2>
            <p>{mentorship.question}</p>
            <p>
              {strings.mentorship.with}: {mentorship.student_name} · {mentorship.mentor_name} ·{" "}
              {mentorshipStatusLabel(mentorship.status)}
            </p>
            {canCompleteMentorship(mentorship.status) ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void post(`/api/mentorships/${mentorship.id}/complete`).then((ok) => ok && setNotice(strings.mentorship.completed))}
              >
                {strings.mentorship.complete}
              </button>
            ) : null}
          </section>

          <section>
            <h2>{strings.mentorship.agreementTitle}</h2>
            <p>
              {strings.mentorship.cadence}: {cadenceLabel(mentorship.cadence)}
            </p>
            <p>
              {strings.mentorship.plannedWeeks}: {mentorship.planned_weeks ?? "—"}
            </p>
            <p>
              {strings.mentorship.goal}: {mentorship.goal ?? "—"}
            </p>
            <p>
              {agreementState(
                mentorship.student_acknowledged_at,
                mentorship.mentor_acknowledged_at,
                true,
              )}
            </p>
            <p>
              <label>
                {strings.mentorship.cadence}
                <select value={cadence} onChange={(event) => setCadence(event.target.value)}>
                  <option value="">—</option>
                  <option value="WEEKLY">{strings.mentorship.cadenceWeekly}</option>
                  <option value="BIWEEKLY">{strings.mentorship.cadenceBiweekly}</option>
                  <option value="MONTHLY">{strings.mentorship.cadenceMonthly}</option>
                  <option value="AD_HOC">{strings.mentorship.cadenceAdHoc}</option>
                </select>
              </label>{" "}
              <label>
                {strings.mentorship.plannedWeeks}
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={plannedWeeks}
                  onChange={(event) => setPlannedWeeks(event.target.value)}
                />
              </label>{" "}
              <label>
                {strings.mentorship.goal}
                <input value={goal} onChange={(event) => setGoal(event.target.value)} />
              </label>
            </p>
            <p>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void post(
                    `/api/mentorships/${mentorship.id}/agreement`,
                    {
                      ...(cadence ? { cadence } : {}),
                      ...(plannedWeeks ? { planned_weeks: Number(plannedWeeks) } : {}),
                      ...(goal ? { goal } : {}),
                    },
                    "PUT",
                  ).then((ok) => ok && setNotice(strings.mentorship.saved))
                }
              >
                {strings.mentorship.saveAgreement}
              </button>{" "}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void post(`/api/mentorships/${mentorship.id}/agreement/acknowledge`).then(
                    (ok) => ok && setNotice(strings.mentorship.acknowledgedByYou),
                  )
                }
              >
                {strings.mentorship.acknowledge}
              </button>
            </p>
          </section>

          <section>
            <h2>{strings.mentorship.threadTitle}</h2>
            {messages.length === 0 ? (
              <p>{strings.mentorship.threadEmpty}</p>
            ) : (
              <ul>
                {messages.map((message) => (
                  <li key={message.id}>
                    <p>
                      <strong>{message.sender_name}</strong> · {dateLabel(message.created_at)}
                    </p>
                    <p>{message.body}</p>
                    {showReportControl(mentorship.viewer_role) ? (
                      reportMessageId === message.id ? (
                        <div>
                          <p>{strings.report.title}</p>
                          <label>
                            {strings.report.reasonLabel}{" "}
                            <select
                              value={reportReason}
                              onChange={(event) => setReportReason(event.target.value)}
                            >
                              <option value="">—</option>
                              {REPORT_REASON_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <p>
                            <label>
                              {strings.report.detailsLabel}
                              <textarea
                                value={reportDetails}
                                maxLength={2000}
                                onChange={(event) => setReportDetails(event.target.value)}
                              />
                            </label>
                          </p>
                          <button type="button" disabled={busy} onClick={() => void sendReport()}>
                            {strings.report.submit}
                          </button>{" "}
                          <button type="button" onClick={() => setReportMessageId(null)}>
                            {strings.report.cancel}
                          </button>
                        </div>
                      ) : (
                        <p>
                          <button
                            type="button"
                            onClick={() => {
                              setReportMessageId(message.id);
                              setReportNotice(null);
                            }}
                          >
                            {strings.report.control}
                          </button>
                        </p>
                      )
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <p role="status">{reportNotice}</p>
            <p>
              <label>
                {strings.mentorship.messageLabel}
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
              </label>
            </p>
            <p>
              <button type="button" disabled={busy} onClick={() => void send()}>
                {busy ? strings.mentorship.sending : strings.mentorship.send}
              </button>
            </p>
          </section>

          <section>
            <h2>{strings.mentorship.sessionsTitle}</h2>
            <p>{strings.mentorship.untrustedLink}</p>
            {mentorship.sessions.length === 0 ? (
              <p>{strings.mentorship.sessionsEmpty}</p>
            ) : (
              <ul>
                {mentorship.sessions.map((session) => (
                  <li key={session.id}>
                    <p>
                      {strings.mentorship.sessionStart}: {dateLabel(session.scheduled_start)} ·{" "}
                      {session.duration_minutes} {strings.mentorship.sessionDuration} ·{" "}
                      {sessionStatusLabel(session.status)}
                    </p>
                    <p>
                      <a href={session.meeting_url} target="_blank" rel="noreferrer noopener">
                        {session.meeting_url}
                      </a>
                    </p>
                    {canConfirmSession(session.status) ? (
                      <p>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void post(`/api/sessions/${session.id}/confirm-held`).then(
                              (ok) => ok && setNotice(strings.mentorship.confirmedHeld),
                            )
                          }
                        >
                          {strings.mentorship.confirmHeld}
                        </button>{" "}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const reason = window.prompt(strings.mentorship.cancelReason) ?? "";
                            void post(`/api/sessions/${session.id}/cancel`, { reason }).then(
                              (ok) => ok && setNotice(strings.mentorship.cancelled),
                            );
                          }}
                        >
                          {strings.mentorship.cancelSession}
                        </button>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <p>
              <label>
                {strings.mentorship.sessionStart}
                <input
                  type="datetime-local"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </label>{" "}
              <label>
                {strings.mentorship.sessionDuration}
                <input
                  type="number"
                  min={15}
                  max={240}
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                />
              </label>{" "}
              <label>
                {strings.mentorship.meetingLink}
                <input
                  type="url"
                  value={meetingUrl}
                  onChange={(event) => setMeetingUrl(event.target.value)}
                />
              </label>
            </p>
            <p>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void post(
                    `/api/mentorships/${mentorship.id}/sessions`,
                    {
                      scheduled_start: start ? new Date(start).toISOString() : undefined,
                      duration_minutes: Number(duration),
                      meeting_url: meetingUrl,
                    },
                  ).then((ok) => ok && setNotice(strings.mentorship.scheduled))
                }
              >
                {strings.mentorship.scheduleSession}
              </button>
            </p>
          </section>
        </>
      ) : null}

      {state === "ready" && mentorship ? (
        <OutcomeSection
          mentorshipId={mentorship.id}
          viewerRole={mentorship.viewer_role ?? "student"}
        />
      ) : null}

      <p>
        <a href="/requests">{strings.mentorship.backToRequests}</a>
      </p>
    </main>
  );
}
