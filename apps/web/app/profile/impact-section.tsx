"use client";

import { useCallback, useEffect, useState } from "react";

import { IMPACT_RELIABILITY_MIN_SAMPLE } from "@connect/config";

import {
  impactState,
  reliabilityState,
  renderRows,
  type ImpactReport,
  type ImpactRow,
} from "../../lib/impact-view";
import { strings } from "../../lib/strings";

/** The profile page's verified-impact section: counts by field, never a score. */
export function ImpactSection() {
  const [rows, setRows] = useState<ImpactRow[]>([]);
  const [total, setTotal] = useState(0);
  const [decidedInTime, setDecidedInTime] = useState(0);
  const [lateOrExpired, setLateOrExpired] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setFailed(false);
    try {
      const response = await fetch("/api/me/impact");
      if (!response.ok) {
        setFailed(true);
        return;
      }
      const payload = (await response.json()) as ImpactReport;
      setRows(payload.data ?? []);
      setTotal(payload.counted_outcomes ?? 0);
      setDecidedInTime(payload.requests_decided_in_time ?? 0);
      setLateOrExpired(payload.requests_late_or_expired ?? 0);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "web.impact_load_failed",
          message: error instanceof Error ? error.message : "unknown error",
        }),
      );
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const state = impactState({ loaded, failed, rows });
  const report: ImpactReport = {
    data: rows,
    counted_outcomes: total,
    requests_decided_in_time: decidedInTime,
    requests_late_or_expired: lateOrExpired,
  };

  return (
    <section>
      <h2>{strings.impact.title}</h2>
      <p>{strings.impact.intro}</p>
      <p>{strings.disclaimer.verified}</p>

      {state === "loading" ? <p>{strings.impact.loading}</p> : null}
      {state === "error" ? (
        <p>
          {strings.impact.loadError}{" "}
          <button type="button" onClick={() => void load()}>
            {strings.impact.retry}
          </button>
        </p>
      ) : null}
      {state === "empty" ? <p>{strings.impact.empty}</p> : null}
      {state === "ready" ? (
        <>
          <p>
            {strings.impact.countedOutcomes}: {total}
          </p>
          <table>
            <thead>
              <tr>
                <th>{strings.impact.field}</th>
                <th>{strings.impact.outcomeType}</th>
                <th>{strings.impact.count}</th>
              </tr>
            </thead>
            <tbody>
              {renderRows(report).map((row) => (
                <tr key={`${row.field}|${row.type}`}>
                  <td>{row.field}</td>
                  <td>{row.type}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {state === "ready" ? (
        <section>
          <h3>{strings.impact.reliabilityTitle}</h3>
          <p>{strings.impact.reliabilityIntro}</p>
          {reliabilityState(report, IMPACT_RELIABILITY_MIN_SAMPLE) === "hidden" ? (
            <p>{strings.impact.reliabilityNotEnough}</p>
          ) : (
            <ul>
              <li>
                {strings.impact.decidedInTime}: {decidedInTime}
              </li>
              <li>
                {strings.impact.lateOrExpired}: {lateOrExpired}
              </li>
            </ul>
          )}
        </section>
      ) : null}
    </section>
  );
}
