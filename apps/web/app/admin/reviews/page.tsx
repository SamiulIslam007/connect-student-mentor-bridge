"use client";

import { useEffect, useState } from "react";

import {
  caseKindLabel,
  removeCase,
  reviewBody,
  waitingLabel,
  type ReviewCase,
  type ReviewDecision,
  type ReviewQueuePayload,
} from "../../../lib/review-queue";
import { strings } from "../../../lib/strings";
import { csrfFetch } from "../../../lib/csrf-client";

type PageState = "loading" | "ready" | "error" | "signed-out" | "mfa-required";

export default function AdminReviewsPage() {
  const [state, setState] = useState<PageState>("loading");
  const [cases, setCases] = useState<ReviewCase[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const response = await fetch("/api/review-queue");
        if (!active) {
          return;
        }
        if (response.status === 401) {
          setState("signed-out");
          return;
        }
        const payload = (await response.json().catch(() => ({}))) as {
          code?: string;
          data?: ReviewCase[];
        };
        if (response.status === 403 && payload.code === "MFA_REQUIRED") {
          setState("mfa-required");
          return;
        }
        if (!response.ok) {
          setState("error");
          return;
        }
        setCases((payload as ReviewQueuePayload).data ?? []);
        setState("ready");
      } catch {
        if (active) {
          setState("error");
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  async function decide(id: string, decision: ReviewDecision): Promise<void> {
    const composed = reviewBody(decision, reasons[id] ?? "");
    if (!composed.ok) {
      setMessage(composed.message);
      return;
    }
    setBusy(id);
    setMessage(null);
    try {
      const response = await csrfFetch(`/api/outcomes/${id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(composed.body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        code?: string;
        detail?: unknown;
      };
      if (!response.ok) {
        setMessage(
          payload.code === "OUTCOME_INVALID_STATE"
            ? strings.adminReviews.invalidState
            : strings.adminReviews.actionError,
        );
        return;
      }
      setCases((rows) => removeCase(rows, id));
      setMessage(decision === "valid" ? strings.adminReviews.counted : strings.adminReviews.rejected);
    } catch {
      setMessage(strings.adminReviews.actionError);
    } finally {
      setBusy(null);
    }
  }

  const stateMessage =
    state === "loading"
      ? strings.adminReviews.loading
      : state === "signed-out"
        ? strings.adminReviews.signedOut
        : state === "mfa-required"
          ? strings.adminReviews.mfaRequired
          : state === "error"
            ? strings.adminReviews.loadError
            : null;

  return (
    <main>
      <h1>{strings.adminReviews.title}</h1>
      <p>{strings.adminReviews.intro}</p>

      <p role="status">{stateMessage ?? message}</p>
      {state === "error" ? (
        <button type="button" onClick={() => window.location.reload()}>
          {strings.adminReviews.retry}
        </button>
      ) : null}

      {state === "ready" && cases.length === 0 ? <p>{strings.adminReviews.empty}</p> : null}

      {state === "ready" && cases.length > 0 ? (
        <ul>
          {cases.map((entry) => (
            <li key={entry.id}>
              <p>
                <strong>{entry.description}</strong>
              </p>
              <p>
                {entry.student_name} → {entry.mentor_name} · {entry.field_name} ·{" "}
                {caseKindLabel(entry.case_kind)} · {waitingLabel(entry.waiting_days)}
              </p>
              {entry.reason ? <p>{entry.reason}</p> : null}
              <label>
                {strings.adminReviews.reasonLabel}
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={reasons[entry.id] ?? ""}
                  onChange={(event) =>
                    setReasons((current) => ({ ...current, [entry.id]: event.target.value }))
                  }
                />
              </label>
              <p>
                <button
                  type="button"
                  disabled={busy === entry.id}
                  onClick={() => void decide(entry.id, "valid")}
                >
                  {strings.adminReviews.markValid}
                </button>{" "}
                <button
                  type="button"
                  disabled={busy === entry.id}
                  onClick={() => void decide(entry.id, "invalid")}
                >
                  {strings.adminReviews.markInvalid}
                </button>
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <p>
        <a href="/account">{strings.adminReviews.backToAccount}</a>
      </p>
    </main>
  );
}
