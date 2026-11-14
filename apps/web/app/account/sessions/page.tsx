"use client";

import { useCallback, useEffect, useState } from "react";

import {
  beginLoad,
  settleFailure,
  settleSuccess,
  stateKey,
  type PageStatus,
} from "../../../lib/page-state";
import { clearAllDrafts } from "../../../lib/request-draft";
import { strings } from "../../../lib/strings";
import { csrfFetch } from "../../../lib/csrf-client";

interface Session {
  id: string;
  created_at: string;
  expires_at: string;
  current: boolean;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [status, setStatus] = useState<PageStatus>({ state: "idle", message: null });
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setStatus(beginLoad());
    try {
      const response = await fetch("/api/me/sessions");
      if (response.status === 401) {
        setStatus(settleFailure(strings.sessions.signedOut));
        return;
      }
      if (!response.ok) {
        setStatus(settleFailure(stateKey("error", "sessions")));
        return;
      }
      const body = (await response.json()) as { data: Session[] };
      setSessions(body.data);
      setStatus(settleSuccess(body.data.length === 0));
    } catch {
      setStatus(settleFailure(stateKey("error", "sessions")));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(id: string): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const response = await csrfFetch(`/api/me/sessions/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setStatus(settleFailure(stateKey("error", "sessions")));
        return;
      }
      await load();
      setNotice(strings.sessions.revoked);
    } catch {
      setStatus(settleFailure(stateKey("error", "sessions")));
    } finally {
      setBusy(false);
    }
  }

  async function signOutEverywhere(): Promise<void> {
    setConfirming(false);
    setBusy(true);
    try {
      const response = await csrfFetch("/api/auth/sign-out-everywhere", { method: "POST" });
      // `401` means the session is already gone; the BFF clears the cookie either way.
      if (response.ok || response.status === 401) {
        // Every draft goes with the session, on both success and an already-dead one.
        clearAllDrafts();
        window.location.assign("/");
        return;
      }
      setStatus(settleFailure(strings.sessions.signOutError));
    } catch {
      setStatus(settleFailure(strings.sessions.signOutError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>{strings.sessions.title}</h1>
      <p>{strings.sessions.intro}</p>

      {status.state === "loading" ? <p role="status">{stateKey("loading", "sessions")}</p> : null}
      {status.state === "error" ? (
        <>
          <p role="alert">{status.message}</p>
          <button type="button" onClick={() => void load()}>
            {strings.sessions.retry}
          </button>
        </>
      ) : null}
      {status.state === "empty" ? <p>{stateKey("empty", "sessions")}</p> : null}
      {status.state === "ready" ? (
        <ul>
          {sessions.map((session) => (
            <li key={session.id}>
              <span>{new Date(session.created_at).toISOString()}</span>
              {session.current ? <strong>{strings.sessions.current}</strong> : null}
              <button type="button" disabled={busy} onClick={() => void revoke(session.id)}>
                {strings.sessions.revoke}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {notice ? <p role="status">{notice}</p> : null}
      {confirming ? (
        <div>
          <p>{strings.sessions.signOutPrompt}</p>
          <button type="button" disabled={busy} onClick={() => void signOutEverywhere()}>
            {strings.session.signOutEverywhere}
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            {strings.account.cancel}
          </button>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={() => setConfirming(true)}>
          {strings.session.signOutEverywhere}
        </button>
      )}
      <p>
        <a href="/account">{strings.account.backToAccount}</a>
      </p>
    </main>
  );
}
