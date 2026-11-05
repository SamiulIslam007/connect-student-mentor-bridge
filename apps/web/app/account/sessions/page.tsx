"use client";

import { useEffect, useState } from "react";

import { strings } from "../../../lib/strings";

interface Session {
  id: string;
  created_at: string;
  expires_at: string;
  current: boolean;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function load(): Promise<void> {
    const response = await fetch("/api/me/sessions");
    if (response.ok) {
      const body = (await response.json()) as { data: Session[] };
      setSessions(body.data);
      return;
    }
    setMessage(response.status === 401 ? strings.sessions.signedOut : strings.sessions.loadError);
  }

  useEffect(() => {
    void load();
  }, []);

  async function revoke(id: string): Promise<void> {
    const response = await fetch(`/api/me/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage(strings.sessions.loadError);
      return;
    }
    setMessage(strings.sessions.revoked);
    await load();
  }

  async function signOutEverywhere(): Promise<void> {
    setConfirming(false);
    const response = await fetch("/api/auth/sign-out-everywhere", { method: "POST" });
    // `401` means the session is already gone; the BFF clears the cookie either way.
    if (response.ok || response.status === 401) {
      window.location.assign("/");
      return;
    }
    setMessage(strings.sessions.signOutError);
  }

  return (
    <main>
      <h1>{strings.sessions.title}</h1>
      <p>{strings.sessions.intro}</p>
      {sessions === null ? null : (
        <ul>
          {sessions.map((session) => (
            <li key={session.id}>
              <span>{new Date(session.created_at).toISOString()}</span>
              {session.current ? <strong>{strings.sessions.current}</strong> : null}
              <button type="button" onClick={() => void revoke(session.id)}>
                {strings.sessions.revoke}
              </button>
            </li>
          ))}
        </ul>
      )}
      {message ? <p role="status">{message}</p> : null}
      {confirming ? (
        <div>
          <p>{strings.sessions.signOutPrompt}</p>
          <button type="button" onClick={() => void signOutEverywhere()}>
            {strings.session.signOutEverywhere}
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            {strings.account.cancel}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}>
          {strings.session.signOutEverywhere}
        </button>
      )}
      <p>
        <a href="/account">{strings.account.backToAccount}</a>
      </p>
    </main>
  );
}
