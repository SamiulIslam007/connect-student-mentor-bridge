import type { Database } from "../db/database.js";

/** The four report targets (design D1). */
export const REPORT_TARGET_KINDS = ["USER", "MESSAGE", "PROFILE", "OUTCOME"] as const;
export type ReportTargetKind = (typeof REPORT_TARGET_KINDS)[number];

/** The fixed reason set; the contract and a table check agree with this list. */
export const REPORT_REASONS = [
  "HARASSMENT",
  "SPAM",
  "IMPERSONATION",
  "MISREPRESENTATION",
  "OTHER",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_DECISIONS = ["ACTIONED", "DISMISSED"] as const;
export type ReportDecision = (typeof REPORT_DECISIONS)[number];

export interface CreateReportInput {
  reporterUserId: string;
  targetKind: ReportTargetKind;
  targetId: string;
  reason: ReportReason;
  details?: string;
  requestId: string;
}

export interface ResolveReportInput {
  reportId: string;
  adminUserId: string;
  decision: ReportDecision;
  reason: string;
  requestId: string;
}

export interface ListReportsInput {
  limit: number;
  cursor?: string;
}

export interface ReportRecord {
  id: string;
  reporterUserId: string;
  targetKind: ReportTargetKind;
  targetId: string;
  reason: string;
  details: string | null;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  decision: string | null;
  resolutionReason: string | null;
  resolvedByUserId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface ReportPage {
  reports: ReportRecord[];
  nextCursor: string | null;
}

export interface ReportsService {
  /** Refuses a target the reporter cannot see, with the same answer as an absent one. */
  create(input: CreateReportInput): Promise<ReportRecord>;
  /** Open reports, oldest first; keyset on (created_at, id). */
  list(input: ListReportsInput): Promise<ReportPage>;
  /** Resolves an open report exactly once; a second call is `REPORT_ALREADY_RESOLVED`. */
  resolve(input: ResolveReportInput): Promise<ReportRecord>;
}

export type ReportsDatabase = Database;
