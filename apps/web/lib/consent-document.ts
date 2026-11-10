import { CONSENT_DOCUMENT_VERSION } from "@connect/config";

import { strings } from "./strings";

/**
 * The consent documents as data, so the two pages and their test read one
 * source. The version is the constant the API stores on every consent record
 * (D-82); no page repeats the literal.
 */
export type ConsentDocumentKind = "terms" | "privacy";

export interface ConsentDocumentSection {
  heading: string;
  body: string;
}

export interface ConsentDocumentView {
  kind: ConsentDocumentKind;
  title: string;
  version: string;
  draftNotice: string;
  sections: readonly ConsentDocumentSection[];
}

export function consentDocument(kind: ConsentDocumentKind): ConsentDocumentView {
  const source = kind === "terms" ? strings.legal.terms : strings.legal.privacy;
  return {
    kind,
    title: source.title,
    version: CONSENT_DOCUMENT_VERSION,
    draftNotice: strings.legal.draftNotice,
    sections: source.sections,
  };
}

/** The browser gate; the API refuses an unaccepted registration as well (D-82). */
export function canSubmitSignUp(consentAccepted: boolean): boolean {
  return consentAccepted;
}
