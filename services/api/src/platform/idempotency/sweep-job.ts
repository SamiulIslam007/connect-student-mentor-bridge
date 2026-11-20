import { IDEMPOTENCY_SWEEP_BATCH } from "@connect/config";

/**
 * The sweep's registration (design R7). Hourly, five hundred records per pass;
 * one statement deletes every record whose `expires_at` has passed, so a
 * completed record is replayed for 24 hours and a crashed intent frees its key
 * after five minutes. No dry run: a row is a transport artefact, not user data.
 */
export const IDEMPOTENCY_SWEEP_QUEUE = "idempotency-sweep";
export const IDEMPOTENCY_SWEEP_CRON = "0 * * * *";
export const IDEMPOTENCY_SWEEP_LIMIT = IDEMPOTENCY_SWEEP_BATCH;
