import { consentAction, consentPurpose } from "../db/schema/enums.js";

/** The five purposes come from the database enum; this module adds no sixth (design R1). */
export const CONSENT_PURPOSES = consentPurpose.enumValues;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const CONSENT_ACTIONS = consentAction.enumValues;
export type ConsentActionValue = (typeof CONSENT_ACTIONS)[number];

/** The one purpose that names an institution and is granted per institution (design R4). */
export const SHARING_PURPOSE: ConsentPurpose = "INSTITUTION_DATA_SHARING";

/** Longest document version accepted; the published constant is far shorter. */
export const CONSENT_VERSION_MAX_LENGTH = 32;

export interface ConsentState {
  purpose: ConsentPurpose;
  current_version: string;
  accepted_version: string | null;
  action: ConsentActionValue | null;
  institution_id: string | null;
}

export interface ConsentInstitution {
  id: string;
  name: string;
}

export interface ConsentsView {
  purposes: ConsentState[];
  /** The caller's institutions, so the sharing section can name them (design R4). */
  institutions: ConsentInstitution[];
}

export interface RecordedConsent {
  purpose: ConsentPurpose;
  action: ConsentActionValue;
  document_version: string;
  institution_id: string | null;
  /** Set the first time the volunteer agreement is accepted; never cleared (design R2). */
  orientation_completed_at: string | null;
}

export interface RecordConsentInput {
  userId: string;
  purpose: string;
  action: unknown;
  documentVersion: unknown;
  institutionId: unknown;
  requestId: string;
}

export function isConsentPurpose(value: string): value is ConsentPurpose {
  return (CONSENT_PURPOSES as readonly string[]).includes(value);
}

export function isConsentAction(value: unknown): value is ConsentActionValue {
  return typeof value === "string" && (CONSENT_ACTIONS as readonly string[]).includes(value);
}

export interface ConsentService {
  /** The caller's latest state per purpose, plus the institutions they belong to. */
  read(userId: string): Promise<ConsentsView>;
  /** One append-only row and one audit row, in one transaction. */
  record(input: RecordConsentInput): Promise<RecordedConsent>;
}
