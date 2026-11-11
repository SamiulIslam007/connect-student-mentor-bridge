"use client";

import { useEffect, useRef, useState } from "react";

import {
  DRAFT_DEBOUNCE_MS,
  clearDraft,
  readDraft,
  writeDraft,
  type RequestDraftValues,
} from "../../../lib/request-draft";
import { strings } from "../../../lib/strings";

interface MentorContext {
  id: string;
  display_name: string;
  headline: string;
  access_mode: string;
  status: string;
}

interface Problem {
  code?: string;
  detail?: unknown;
}

export default function NewRequestPage() {
  const [mentor, setMentor] = useState<MentorContext | null>(null);
  const [mentorError, setMentorError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [contextSummary, setContextSummary] = useState("");
  const [targetOutcome, setTargetOutcome] = useState("");
  const [timeframe, setTimeframe] = useState("WITHIN_1_MONTH");
  const [interaction, setInteraction] = useState("ASYNC_THREAD");
  const [applicationNote, setApplicationNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [mentorId, setMentorId] = useState<string | null>(null);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const latestValues = useRef<RequestDraftValues | null>(null);

  useEffect(() => {
    let active = true;
    const requestedMentorId = new URLSearchParams(window.location.search).get("mentor");
    if (!requestedMentorId) {
      setMentorError(strings.requestNew.mentorMissing);
      return;
    }
    setMentorId(requestedMentorId);
    const mentorId = requestedMentorId;
    void (async () => {
      try {
        const response = await fetch(`/api/mentors/${encodeURIComponent(mentorId)}`);
        if (!active) {
          return;
        }
        if (!response.ok) {
          setMentorError(strings.requestNew.mentorUnavailable);
          return;
        }
        setMentor((await response.json()) as MentorContext);
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "web.mentor_context_failed",
            message: error instanceof Error ? error.message : "unknown error",
          }),
        );
        if (active) {
          setMentorError(strings.requestNew.mentorLoadError);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // The draft is read once per mentor and applied as one update, so a reload
  // restores it without the initial state overwriting it (design R1, 2.1).
  useEffect(() => {
    if (!mentorId) {
      return;
    }
    const draft = readDraft(mentorId);
    if (!draft) {
      return;
    }
    setQuestion(draft.question);
    setContextSummary(draft.contextSummary);
    setTargetOutcome(draft.targetOutcome);
    setTimeframe(draft.timeframe);
    setInteraction(draft.interaction);
    setApplicationNote(draft.applicationNote);
    setRestoredDraft(
      Boolean(
        draft.question ||
          draft.contextSummary ||
          draft.targetOutcome ||
          draft.applicationNote,
      ),
    );
  }, [mentorId]);

  latestValues.current = {
    question,
    contextSummary,
    targetOutcome,
    timeframe,
    interaction,
    applicationNote,
  };

  // One write per typing pause; the timer is cancelled on the next keystroke and
  // the unmount effect below flushes whatever is pending (design R3).
  useEffect(() => {
    if (!mentorId) {
      return;
    }
    const timer = setTimeout(() => {
      const values = latestValues.current;
      if (values) {
        writeDraft(mentorId, values);
      }
    }, DRAFT_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [mentorId, question, contextSummary, targetOutcome, timeframe, interaction, applicationNote]);

  useEffect(() => {
    if (!mentorId) {
      return;
    }
    const key = mentorId;
    return () => {
      const values = latestValues.current;
      if (values) {
        writeDraft(key, values);
      }
    };
  }, [mentorId]);

  const applicationOnly = mentor?.access_mode === "APPLICATION_ONLY";
  const paused = mentor?.access_mode === "PAUSED";

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!mentor) {
      return;
    }
    setSending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mentor_id: mentor.id,
          question,
          context_summary: contextSummary,
          target_outcome: targetOutcome,
          expected_timeframe: timeframe,
          interaction_type: interaction,
          ...(applicationNote.trim() ? { application_note: applicationNote } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as Problem;
      if (!response.ok) {
        setStatus(
          typeof payload.detail === "string" ? payload.detail : strings.requestNew.error,
        );
        return;
      }
      // The request exists; the draft must not resurface (spec: successful send).
      clearDraft(mentor.id);
      window.location.href = "/requests";
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "web.request_create_failed",
          message: error instanceof Error ? error.message : "unknown error",
        }),
      );
      setStatus(strings.requestNew.error);
    } finally {
      setSending(false);
    }
  }

  return (
    <main>
      <h1>{strings.requestNew.title}</h1>
      <p>{strings.requestNew.intro}</p>

      {mentor ? (
        <p>
          <strong>{mentor.display_name}</strong> · {mentor.headline}
        </p>
      ) : null}
      {restoredDraft ? <p role="status">{strings.requestNew.restoredDraft}</p> : null}
      {mentorError ? <p role="alert">{mentorError}</p> : null}
      {paused ? <p role="alert">{strings.requestNew.mentorUnavailable}</p> : null}

      {mentor && !paused ? (
        <form onSubmit={submit}>
          <label>
            {strings.requestNew.question}
            <textarea
              maxLength={300}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              required
            />
          </label>
          <label>
            {strings.requestNew.contextSummary}
            <textarea
              maxLength={2000}
              value={contextSummary}
              onChange={(event) => setContextSummary(event.target.value)}
              required
            />
          </label>
          <label>
            {strings.requestNew.targetOutcome}
            <textarea
              maxLength={300}
              value={targetOutcome}
              onChange={(event) => setTargetOutcome(event.target.value)}
              required
            />
          </label>
          <label>
            {strings.requestNew.timeframe}
            <select value={timeframe} onChange={(event) => setTimeframe(event.target.value)}>
              <option value="WITHIN_1_MONTH">{strings.requestNew.timeframeWithin1Month}</option>
              <option value="ONE_TO_3_MONTHS">{strings.requestNew.timeframeOneTo3Months}</option>
              <option value="THREE_TO_6_MONTHS">
                {strings.requestNew.timeframeThreeTo6Months}
              </option>
              <option value="OVER_6_MONTHS">{strings.requestNew.timeframeOver6Months}</option>
            </select>
          </label>
          <label>
            {strings.requestNew.interaction}
            <select value={interaction} onChange={(event) => setInteraction(event.target.value)}>
              <option value="ASYNC_THREAD">{strings.requestNew.interactionAsync}</option>
              <option value="ONE_TO_ONE_SESSION">{strings.requestNew.interactionOneToOne}</option>
            </select>
          </label>
          <label>
            {strings.requestNew.applicationNote}
            <textarea
              maxLength={1000}
              value={applicationNote}
              onChange={(event) => setApplicationNote(event.target.value)}
              required={applicationOnly}
            />
          </label>
          <p>
            {applicationOnly
              ? strings.requestNew.applicationNoteRequired
              : strings.requestNew.applicationNoteHint}
          </p>
          <button type="submit" disabled={sending}>
            {sending ? strings.requestNew.sending : strings.requestNew.submit}
          </button>
          <p role="status">{status}</p>
        </form>
      ) : null}

      <p>
        <a href="/requests">{strings.requestNew.backToRequests}</a>
      </p>
    </main>
  );
}
