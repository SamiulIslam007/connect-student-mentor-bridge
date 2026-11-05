import type { Role } from "./identity.js";

/**
 * FR-PROF-04 as a pure, total policy (design D7). The caller resolves consent
 * and case references; this function never guesses them and does no I/O.
 */
export type ProfileKind = "STUDENT" | "MENTOR";
export type ProfileVisibility = "VISIBLE" | "HIDDEN";

export interface ProfileViewer {
  authenticated: boolean;
  isOwner: boolean;
  roles: Role[];
  /** The viewer is the mentor that this student sent a request to. */
  hasRequestFromSubject: boolean;
  /** An active consent for this institution and purpose exists. */
  hasInstitutionConsent: boolean;
  /** A dispute or support case justifies a break-glass read. */
  hasCaseReference: boolean;
}

export function canViewProfile(viewer: ProfileViewer, kind: ProfileKind): ProfileVisibility {
  if (!viewer.authenticated) {
    return "HIDDEN";
  }
  if (viewer.isOwner) {
    return "VISIBLE";
  }
  if (kind === "MENTOR") {
    return "VISIBLE";
  }
  if (viewer.hasRequestFromSubject) {
    return "VISIBLE";
  }
  if (viewer.roles.includes("INSTITUTION_ADMIN") && viewer.hasInstitutionConsent) {
    return "VISIBLE";
  }
  if (viewer.roles.includes("PLATFORM_ADMIN") && viewer.hasCaseReference) {
    return "VISIBLE";
  }
  return "HIDDEN";
}
