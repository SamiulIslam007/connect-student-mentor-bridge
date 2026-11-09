"use client";

import { useEffect, useState } from "react";

import {
  accessStateLabel,
  canRequest,
  directoryQuery,
  mergeCards,
  type MentorCard,
  type MentorDirectoryPayload,
} from "../../lib/mentor-directory";
import { strings } from "../../lib/strings";

interface FieldSummary {
  id: string;
  name: string;
}

type PageState = "loading" | "ready" | "error";

export default function MentorsPage() {
  const [fields, setFields] = useState<FieldSummary[]>([]);
  const [field, setField] = useState("");
  const [accessState, setAccessState] = useState("");
  const [cards, setCards] = useState<MentorCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<PageState>("loading");
  const [moreError, setMoreError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      setState("loading");
      setMoreError(null);
      try {
        const response = await fetch(`/api/mentors${directoryQuery({ field, accessState })}`);
        if (!active) {
          return;
        }
        if (!response.ok) {
          setState("error");
          return;
        }
        const payload = (await response.json()) as MentorDirectoryPayload;
        setCards(payload.data ?? []);
        setCursor(payload.next_cursor ?? null);
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
  }, [field, accessState, reloadKey]);

  // The field taxonomy read needs a session; an anonymous visitor still gets
  // the directory and the access-state filter.
  useEffect(() => {
    let active = true;
    fetch("/api/fields")
      .then((response) => (response.ok ? response.json() : { fields: [] }))
      .then((payload: { fields?: FieldSummary[] }) => {
        if (active) {
          setFields(payload.fields ?? []);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function loadMore(): Promise<void> {
    if (!cursor || busy) {
      return;
    }
    setBusy(true);
    setMoreError(null);
    try {
      const response = await fetch(
        `/api/mentors${directoryQuery({ field, accessState, cursor })}`,
      );
      if (!response.ok) {
        setMoreError(strings.mentors.loadError);
        return;
      }
      const payload = (await response.json()) as MentorDirectoryPayload;
      setCards((rows) => mergeCards(rows, payload.data ?? []));
      setCursor(payload.next_cursor ?? null);
    } catch {
      setMoreError(strings.mentors.loadError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>{strings.mentors.title}</h1>
      <p>{strings.mentors.intro}</p>

      <p>
        {fields.length > 0 ? (
          <label>
            {strings.mentors.fieldFilter}
            <select value={field} onChange={(event) => setField(event.target.value)}>
              <option value="">{strings.mentors.anyField}</option>
              {fields.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}{" "}
        <label>
          {strings.mentors.stateFilter}
          <select value={accessState} onChange={(event) => setAccessState(event.target.value)}>
            <option value="">{strings.mentors.anyState}</option>
            <option value="available">{strings.mentors.stateAvailable}</option>
            <option value="application_only">{strings.mentors.stateApplicationOnly}</option>
            <option value="full">{strings.mentors.stateFull}</option>
          </select>
        </label>
      </p>

      <p role="status">
        {state === "loading" ? strings.mentors.loading : state === "error" ? strings.mentors.loadError : null}
      </p>
      {state === "error" ? (
        <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
          {strings.mentors.retry}
        </button>
      ) : null}

      {state === "ready" && cards.length === 0 ? <p>{strings.mentors.empty}</p> : null}

      {state === "ready" && cards.length > 0 ? (
        <ul>
          {cards.map((card) => (
            <li key={card.id}>
              <p>
                <strong>{card.display_name}</strong> · {card.headline}
              </p>
              <p>
                {card.primary_field.name} · {card.languages.join(", ")} ·{" "}
                {accessStateLabel(card.access_state)}
              </p>
              {canRequest(card.access_state) ? (
                <p>
                  <a href={`/request/new?mentor=${encodeURIComponent(card.id)}`}>
                    {strings.mentors.request}
                  </a>
                </p>
              ) : (
                <p>
                  <button type="button" disabled>
                    {strings.mentors.request}
                  </button>{" "}
                  {strings.mentors.fullReason}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {moreError ? <p role="status">{moreError}</p> : null}
      {state === "ready" && cursor ? (
        <p>
          <button type="button" disabled={busy} onClick={() => void loadMore()}>
            {strings.mentors.loadMore}
          </button>
        </p>
      ) : null}

      <p>
        <a href="/requests">{strings.mentors.backToRequests}</a>
      </p>
    </main>
  );
}
