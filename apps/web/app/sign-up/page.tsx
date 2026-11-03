"use client";

import { useState, type FormEvent } from "react";

import { strings } from "../../lib/strings";

export default function SignUpPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        display_name: form.get("display_name"),
        email: form.get("email"),
        password: form.get("password"),
        date_of_birth: form.get("date_of_birth"),
      }),
    });

    setSuccess(response.ok);
    setMessage(response.ok ? strings.signUp.success : strings.signUp.error);
  }

  return (
    <main>
      <h1>{strings.signUp.title}</h1>
      <form onSubmit={onSubmit}>
        <p>
          <label htmlFor="display_name">{strings.signUp.displayName}</label>
          <br />
          <input id="display_name" name="display_name" required maxLength={100} autoComplete="name" />
        </p>
        <p>
          <label htmlFor="email">{strings.signUp.email}</label>
          <br />
          <input id="email" name="email" type="email" required autoComplete="email" />
        </p>
        <p>
          <label htmlFor="password">{strings.signUp.password}</label>
          <br />
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
          />
        </p>
        <p>
          <label htmlFor="date_of_birth">{strings.signUp.dateOfBirth}</label>
          <br />
          <input id="date_of_birth" name="date_of_birth" type="date" required />
        </p>
        <p>{strings.signUp.ageGateNote}</p>
        <button type="submit">{strings.signUp.submit}</button>
      </form>
      <p role="status">{message}</p>
      {success ? (
        <p>
          <a href="/sign-in">{strings.signIn.title}</a>
        </p>
      ) : null}
    </main>
  );
}
