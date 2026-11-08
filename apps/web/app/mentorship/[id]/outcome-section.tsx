"use client";

import { useCallback, useEffect, useState } from "react";

import {
  OUTCOME_TYPES,
  actionsFor,
  contributionLabel,
  outcomeStatusLabel,
  outcomeTypeLabel,
  platformDecidedLabel,
  validateReport,
} from "../../../lib/outcome-view";
import { strings } from "../../../lib/strings";

interface OutcomeRecord {
  id: string;
  status: string;
  outcome_type: string;
  description: string;
  contribution_claimed: string;
  contribution_confirmed: string | null;
  counted_basis: string | null;
  coi_declared: boolean;
}

/**
 * The outcome section of the mentorship page. The student reports, the mentor
 * confirms, disputes, or declares a conflict, and the student can withdraw while
 * the outcome is still open.
 */
export function OutcomeSection({
  mentorshipId,
  viewerRole,
}: {
  mentorshipId: string;
  viewerRole: "student" | "mentor";
}) {
  const [outcomes, setOutcomes] = useState<OutcomeRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [description, setDescription] = useState("");
  const [outcomeType, setOutcomeType] = useState<string>("INTERNSHIP");
  const [contribution, setContribution] = useState<string>("HELPED");

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/outcomes?mentorship_id=${encodeURIComponent(mentorshipId)}`);
      if (!response.ok) {
        setFailed(true);
        return;
      }
      const payload = (await response.json()) as { data?: OutcomeRecord[] };
      setOutcomes(payload.data ?? []);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "web.outcomes_load_failed",
          message: error instanceof Error ? error.message : "unknown error",
        }),
      );
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, [mentorshipId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(path: string, body?: unknown, success = strings.outcome.reported): Promise<void> {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) {
        setProblem(strings.outcome.actionError);
        return;
      }
      setNotice(success);
      await load();
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "web.outcome_action_failed",
          message: error instanceof Error ? error.message : "unknown error",
        }),
      );
      setProblem(strings.outcome.actionError);
    } finally {
      setBusy(false);
    }
  }

  function report(): void {
    const checked = validateReport({ description, outcomeType, contribution });
    if (!checked.ok) {
      setProblem(checked.message);
      return;
    }
    void act(
      "/api/outcomes",
      {
        mentorship_id: mentorshipId,
        outcome_type: outcomeType,
        description,
        contribution_claimed: contribution,
      },
      strings.outcome.reported,
    ).then(() => setDescription(""));
  }

  return (
    <section>
      <h2>{strings.outcome.title}</h2>
      <p>{strings.outcome.intro}</p>
      <p>{strings.outcome.unconfirmedCopy}</p>
      <p role="status">{notice}</p>
      <p role="alert">{problem}</p>

      {!loaded ? (
        <p>{strings.outcome.loadError}</p>
      ) : failed ? (
        <p>{strings.outcome.loadError}</p>
      ) : outcomes.length === 0 ? (
        <p>{strings.outcome.empty}</p>
      ) : (
        <ul>
          {outcomes.map((outcome) => {
            const actions = actionsFor(outcome.status);
            return (
              <li key={outcome.id}>
                <p>
                  <strong>{outcomeTypeLabel(outcome.outcome_type)}</strong> ·{" "}
                  {outcomeStatusLabel(outcome.status)}
                  {platformDecidedLabel(outcome.counted_basis) ? (
                    <> · {platformDecidedLabel(outcome.counted_basis)}</>
                  ) : null}
                </p>
                <p>{outcome.description}</p>
                <p>
                  {strings.outcome.contribution}:{" "}
                  {contributionLabel(outcome.contribution_confirmed ?? outcome.contribution_claimed)}
                </p>
                {viewerRole === "mentor" && actions.canConfirm ? (
                  <p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act(`/api/outcomes/${outcome.id}/confirm`, {
                          contribution_level_confirmed: contribution,
                        })
                      }
                    >
                      {strings.outcome.confirm}
                    </button>{" "}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const reason = window.prompt(strings.outcome.disputeReason) ?? "";
                        void act(`/api/outcomes/${outcome.id}/dispute`, { reason });
                      }}
                    >
                      {strings.outcome.dispute}
                    </button>{" "}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act(`/api/outcomes/${outcome.id}/confirm`, {
                          coi_declaration: { relationship: "declared" },
                        })
                      }
                    >
                      {strings.outcome.declareConflict}
                    </button>
                  </p>
                ) : null}
                {viewerRole === "student" && actions.canWithdraw ? (
                  <p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act(`/api/outcomes/${outcome.id}/withdraw`)}
                    >
                      {strings.outcome.withdraw}
                    </button>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {viewerRole === "student" ? (
        <>
          <h3>{strings.outcome.reportTitle}</h3>
          <p>
            <label>
              {strings.outcome.type}
              <select value={outcomeType} onChange={(event) => setOutcomeType(event.target.value)}>
                {OUTCOME_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {outcomeTypeLabel(type)}
                  </option>
                ))}
              </select>
            </label>{" "}
            <label>
              {strings.outcome.contribution}
              <select value={contribution} onChange={(event) => setContribution(event.target.value)}>
                <option value="DIRECTLY_ENABLED">{strings.outcome.contributionDirectlyEnabled}</option>
                <option value="HELPED">{strings.outcome.contributionHelped}</option>
                <option value="MINOR">{strings.outcome.contributionMinor}</option>
              </select>
            </label>
          </p>
          <p>
            <label>
              {strings.outcome.description}
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
          </p>
          <p>
            <button type="button" disabled={busy} onClick={() => report()}>
              {busy ? strings.outcome.reporting : strings.outcome.report}
            </button>
          </p>
        </>
      ) : null}
    </section>
  );
}
