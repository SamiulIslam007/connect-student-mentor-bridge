import { EVIDENCE_RETENTION_DAYS } from "@connect/config";

/**
 * The retention job's registration (FR-PRIV-03, design R7): hourly, oldest
 * settled outcome first, one hundred files per pass.
 */
export const EVIDENCE_RETENTION_QUEUE = "evidence-retention";
export const EVIDENCE_RETENTION_CRON = "0 * * * *";
export const EVIDENCE_RETENTION_BATCH = 100;

/**
 * Dry run unless the variable is exactly `false` (design R5). The mirror of
 * `WEB_CSP_MODE`: there one exact value disables a protection, here one exact
 * value enables a deletion — so a typo, an empty value or a missing variable
 * all delete nothing.
 */
export function retentionDryRun(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.EVIDENCE_RETENTION_DRY_RUN?.trim() !== "false";
}

export function retentionWindowDays(): number {
  return EVIDENCE_RETENTION_DAYS;
}
