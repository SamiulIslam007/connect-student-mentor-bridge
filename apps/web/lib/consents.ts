/**
 * The consent screen's pure rules (design R7). No fetch, no React, so the page
 * stays thin and the web test can assert a helper instead of a render.
 */
import { strings } from "./strings";

export const CONSENT_PURPOSES = [
  "TERMS",
  "PRIVACY_NOTICE",
  "VOLUNTEER_AGREEMENT",
  "COMMUNITY_GUIDELINES",
  "INSTITUTION_DATA_SHARING",
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export interface ConsentState {
  purpose: string;
  current_version: string;
  accepted_version: string | null;
  action: string | null;
  institution_id: string | null;
}

export interface ConsentContext {
  isMentor: boolean;
  hasAffiliation: boolean;
}

/**
 * Which purposes this caller can hold: the two registration documents and the
 * community guidelines for everyone, the volunteer agreement for a mentor, and
 * institution sharing for a student with an affiliation (assumption 1).
 */
export function purposesForContext(context: ConsentContext): ConsentPurpose[] {
  const purposes: ConsentPurpose[] = ["TERMS", "PRIVACY_NOTICE", "COMMUNITY_GUIDELINES"];
  if (context.isMentor) {
    purposes.push("VOLUNTEER_AGREEMENT");
  }
  if (context.hasAffiliation) {
    purposes.push("INSTITUTION_DATA_SHARING");
  }
  return purposes;
}

/** A stale purpose is a banner, never a refusal (design R3). */
export function isStale(state: ConsentState): boolean {
  return state.accepted_version !== null && state.accepted_version !== state.current_version;
}

export function stalePurposes(states: readonly ConsentState[]): ConsentState[] {
  return states.filter(isStale);
}

export function labelFor(purpose: string): string {
  switch (purpose) {
    case "TERMS":
      return strings.consent.termsTitle;
    case "PRIVACY_NOTICE":
      return strings.consent.privacyTitle;
    case "VOLUNTEER_AGREEMENT":
      return strings.consent.volunteerTitle;
    case "COMMUNITY_GUIDELINES":
      return strings.consent.guidelinesTitle;
    case "INSTITUTION_DATA_SHARING":
      return strings.consent.sharingTitle;
    default:
      return purpose;
  }
}

/** The one line under a purpose: accepted, withdrawn, or never answered. */
export function stateTextFor(state: ConsentState): string {
  if (isStale(state)) {
    return strings.consent.stateStale;
  }
  if (state.action === "GRANTED") {
    return strings.consent.stateAccepted;
  }
  if (state.action === "WITHDRAWN") {
    return strings.consent.stateWithdrawn;
  }
  return strings.consent.stateNotAccepted;
}
