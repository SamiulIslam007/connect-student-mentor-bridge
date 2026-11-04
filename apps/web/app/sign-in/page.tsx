"use client";

import { useState, type FormEvent } from "react";

import { strings } from "../../lib/strings";

const FORM_ID = "sign-in-form";

export default function SignInPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    const body = (await response.json().catch(() => ({}))) as { code?: string; status?: string };

    // A withheld session: the second step happens on its own page.
    if (response.ok && body.status === "mfa_required") {
      window.location.assign("/sign-in/mfa");
      return;
    }

    setSignedIn(response.ok);
    setSignedOut(false);
    setEmailNotVerified(response.status === 403 && body.code === "EMAIL_NOT_VERIFIED");

    if (response.ok) {
      setMessage(strings.signIn.success);
    } else if (response.status === 403 && body.code === "EMAIL_NOT_VERIFIED") {
      setMessage(strings.signIn.emailNotVerified);
    } else if (response.status === 403 && body.code === "ACCOUNT_SUSPENDED") {
      setMessage(strings.signIn.suspended);
    } else if (response.status === 403) {
      setMessage(strings.signIn.forbidden);
    } else {
      setMessage(strings.signIn.error);
    }
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
      <form id={FORM_ID} onSubmit={onSubmit}>
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
      <p>
        <a href="/forgot-password">{strings.forgotPassword.title}</a>
      </p>
      <p role="status">{message}</p>
      {emailNotVerified ? (
        <p>
          {/* The API re-sends the verification link on every refused sign-in. */}
          <button type="submit" form={FORM_ID}>
            {strings.signIn.resendVerification}
          </button>
        </p>
      ) : null}
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
