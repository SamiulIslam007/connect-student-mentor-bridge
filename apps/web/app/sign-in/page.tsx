"use client";

import { useState, type FormEvent } from "react";

import { strings } from "../../lib/strings";

export default function SignInPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [signedOut, setSignedOut] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });

    setSignedIn(response.ok);
    setSignedOut(false);
    setMessage(response.ok ? strings.signIn.success : strings.signIn.error);
  }

  async function signOutEverywhere(): Promise<void> {
    const response = await fetch("/api/auth/sign-out-everywhere", { method: "POST" });
    if (response.ok) {
      setSignedIn(false);
      setSignedOut(true);
      setMessage(strings.session.signedOutEverywhere);
    } else {
      setMessage(strings.signIn.error);
    }
  }

  return (
    <main>
      <h1>{strings.signIn.title}</h1>
      <form onSubmit={onSubmit}>
        <p>
          <label htmlFor="email">{strings.signIn.email}</label>
          <br />
          <input id="email" name="email" type="email" required autoComplete="email" />
        </p>
        <p>
          <label htmlFor="password">{strings.signIn.password}</label>
          <br />
          <input id="password" name="password" type="password" required autoComplete="current-password" />
        </p>
        <button type="submit">{strings.signIn.submit}</button>
      </form>
      <p role="status">{message}</p>
      {signedIn && !signedOut ? (
        <p>
          <button type="button" onClick={signOutEverywhere}>
            {strings.session.signOutEverywhere}
          </button>
        </p>
      ) : null}
    </main>
  );
}
