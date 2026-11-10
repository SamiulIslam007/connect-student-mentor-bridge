import type { Database } from "../db/database.js";

/** Version of the exported document; bump it when a section's shape changes. */
export const PRIVACY_EXPORT_VERSION = "1";

/** The one sanctioned writer to `thread_messages.body` (D-85). */
export const DELETED_MESSAGE_BODY =
  "This message was removed when the account was deleted.";

/** `users.name` is `NOT NULL`, so the tombstone uses a placeholder, not `NULL`. */
export const DELETED_DISPLAY_NAME = "Deleted user";

/** `accounts.account_id` is `NOT NULL`; the provider link is severed. */
export const DELETED_PROVIDER_ACCOUNT_ID = "deleted";

export interface ExportAccountInput {
  userId: string;
  requestId: string;
}

export interface DeleteAccountInput {
  userId: string;
  /** Must equal the stored address, case-insensitively (D-86). */
  confirmEmail: string;
  requestId: string;
}

export interface PrivacyExportDocument {
  export_version: string;
  generated_at: string;
  consent_document_version: string;
  [section: string]: unknown;
}

export interface PrivacyService {
  /** The caller's own rows from the fixed allowlist (design D3). */
  exportAccount(input: ExportAccountInput): Promise<PrivacyExportDocument>;
  /** One transaction; the ledger, verification, reputation, and audit rows stay (D-85). */
  deleteAccount(input: DeleteAccountInput): Promise<{ status: "deleted" }>;
}

export type PrivacyDatabase = Database;
