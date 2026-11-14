"use client";

import { useState, type FormEvent } from "react";

import { stateKey } from "../../../lib/page-state";
import { strings } from "../../../lib/strings";
import { csrfFetch } from "../../../lib/csrf-client";

const FORM_ID = "mfa-form";

export default function MfaPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await csrfFetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: form.get("code") }),
      });
      if (response.ok) {
        window.location.assign("/account");
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { code?: string };
      setMessage(
        body.code === "UNAUTHENTICATED" ? strings.mfa.invalid : strings.mfa.error,
      );
    } catch {
      setMessage(strings.mfa.error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>{strings.mfa.title}</h1>
      <p>{strings.mfa.intro}</p>
      <form id={FORM_ID} onSubmit={onSubmit}>
        <label htmlFor="code">{strings.mfa.code}</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required />
        <button type="submit" disabled={submitting}>
          {submitting ? stateKey("loading", "mfa") : strings.mfa.submit}
        </button>
      </form>
      {message ? <p role="alert">{message}</p> : null}
      <a href="/sign-in">{strings.mfa.backToSignIn}</a>
    </main>
  );
}
