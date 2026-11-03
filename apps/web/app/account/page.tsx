"use client";

import { useEffect, useState } from "react";

import { strings } from "../../lib/strings";

interface Account {
  display_name: string;
  email: string;
  account_status: string;
  timezone: string;
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return strings.account.statusPending;
    case "active":
      return strings.account.statusActive;
    case "suspended":
      return strings.account.statusSuspended;
    case "deactivated":
      return strings.account.statusDeactivated;
    case "deletion_pending":
      return strings.account.statusDeletionPending;
    case "anonymized":
      return strings.account.statusAnonymized;
    default:
      return strings.account.statusUnknown;
  }
}

export default function AccountPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const response = await fetch("/api/me");
        const body = (await response.json()) as Account | Record<string, unknown>;
        if (!active) {
          return;
        }
        if (response.ok) {
          setAccount(body as Account);
        } else {
          setMessage(response.status === 401 ? strings.account.signedOut : strings.account.loadError);
        }
      } catch {
        if (active) {
          setMessage(strings.account.loadError);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  async function deactivate(): Promise<void> {
    setConfirming(false);
    try {
      const response = await fetch("/api/me/deactivate", { method: "POST" });
      if (response.ok) {
        setAccount(null);
        setMessage(strings.account.deactivated);
      } else {
        setMessage(response.status === 401 ? strings.account.signedOut : strings.account.loadError);
      }
    } catch {
      // Keep the button usable and the failure visible instead of silent.
      setMessage(strings.account.loadError);
    }
  }

  return (
    <main>
      <h1>{strings.account.title}</h1>
      {account ? (
        <dl>
          <dt>{strings.account.displayName}</dt>
          <dd>{account.display_name}</dd>
          <dt>{strings.account.email}</dt>
          <dd>{account.email}</dd>
          <dt>{strings.account.status}</dt>
          <dd>{statusLabel(account.account_status)}</dd>
          <dt>{strings.account.timezone}</dt>
          <dd>{account.timezone}</dd>
        </dl>
      ) : null}
      <p role="status">{message}</p>
      {account && account.account_status === "active" ? (
        confirming ? (
          <div>
            <p>{strings.account.deactivatePrompt}</p>
            <button type="button" onClick={deactivate}>
              {strings.account.deactivateConfirm}
            </button>
            <button type="button" onClick={() => setConfirming(false)}>
              {strings.account.cancel}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)}>
            {strings.account.deactivate}
          </button>
        )
      ) : null}
    </main>
  );
}
