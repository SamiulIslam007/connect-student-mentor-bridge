"use client";

import { useCallback, useEffect, useState } from "react";

import {
  impactState,
  renderRows,
  type ImpactReport,
  type ImpactRow,
} from "../../lib/impact-view";
import { strings } from "../../lib/strings";

/** The profile page's verified-impact section: counts by field, never a score. */
export function ImpactSection() {
  const [rows, setRows] = useState<ImpactRow[]>([]);
  const [total, setTotal] = useState(0);
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
              {renderRows({ data: rows, counted_outcomes: total }).map((row) => (
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
    </section>
  );
}
