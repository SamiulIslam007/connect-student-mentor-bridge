import { strings } from "./strings";

/** The reasons the API accepts, in the order the form shows them. */
export const REPORT_REASON_OPTIONS = [
  { value: "harassment", label: strings.report.reasonHarassment },
  { value: "spam", label: strings.report.reasonSpam },
  { value: "impersonation", label: strings.report.reasonImpersonation },
  { value: "misrepresentation", label: strings.report.reasonMisrepresentation },
  { value: "other", label: strings.report.reasonOther },
] as const;

/**
 * Only a participant sees the control: the thread read is participant-scoped,
 * and a report on a message the viewer cannot see would be a 404 anyway.
 */
export function showReportControl(viewerRole: string | undefined): boolean {
  return viewerRole === "student" || viewerRole === "mentor";
}

/** The reason labels for the admin queue's target-kind column. */
export function targetKindLabel(kind: string): string {
  switch (kind) {
    case "user":
      return strings.adminReports.targetUser;
    case "message":
      return strings.adminReports.targetMessage;
    case "profile":
      return strings.adminReports.targetProfile;
    case "outcome":
      return strings.adminReports.targetOutcome;
    default:
      return kind;
  }
}
