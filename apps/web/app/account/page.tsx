"use client";

import { useEffect, useState } from "react";

import { deletionConfirmed } from "../../lib/privacy-controls";
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
  const [confirmEmail, setConfirmEmail] = useState("");
  const [privacyBusy, setPrivacyBusy] = useState(false);

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

  async function exportData(): Promise<void> {
    setPrivacyBusy(true);
    setMessage(strings.account.exportStarted);
    try {
      // An empty JSON body: the export takes no fields, and the BFF needs one.
      const response = await fetch("/api/privacy/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        setMessage(response.status === 401 ? strings.account.signedOut : strings.account.exportError);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "connect-export.json";
      link.click();
      URL.revokeObjectURL(url);
      setMessage(strings.account.exportDone);
    } catch {
      setMessage(strings.account.exportError);
    } finally {
      setPrivacyBusy(false);
    }
  }

  async function deleteOwnAccount(): Promise<void> {
    if (!account) {
      return;
    }
    // The API refuses the same mismatch; this keeps the request off the wire.
    if (!deletionConfirmed(account.email, confirmEmail)) {
      setMessage(strings.account.deleteMismatch);
      return;
    }
    setPrivacyBusy(true);
    try {
      const response = await fetch("/api/privacy/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm_email: confirmEmail }),
      });
      if (!response.ok) {
        setMessage(response.status === 401 ? strings.account.signedOut : strings.account.deleteError);
        return;
      }
      setAccount(null);
      setMessage(strings.account.deleteDone);
    } catch {
      setMessage(strings.account.deleteError);
    } finally {
      setPrivacyBusy(false);
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
      <p>
        <a href="/profile">{strings.account.manageProfiles}</a>
      </p>
      <p>
        <a href="/account/sessions">{strings.account.manageSessions}</a>
      </p>
      <p>
        <a href="/account/security">{strings.account.manageSecurity}</a>
      </p>
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
      {account ? (
        <section>
          <h2>{strings.account.privacyTitle}</h2>
          <p>{strings.account.exportHelp}</p>
          <button type="button" disabled={privacyBusy} onClick={() => void exportData()}>
            {strings.account.exportLabel}
          </button>
          <p>{strings.account.deleteHelp}</p>
          <label>
            {strings.account.deleteEmailPrompt}{" "}
            <input
              type="email"
              value={confirmEmail}
              onChange={(event) => setConfirmEmail(event.target.value)}
              autoComplete="off"
            />
          </label>{" "}
          <button type="button" disabled={privacyBusy} onClick={() => void deleteOwnAccount()}>
            {strings.account.deleteConfirm}
          </button>
        </section>
      ) : null}
    </main>
  );
}
