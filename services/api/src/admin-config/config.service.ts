import type { ConfigPayload } from "@connect/domain";

/** One stored version. `id` is what a ledger row names (design R3). */
export interface ConfigVersionRecord {
  id: string;
  version: number;
  payload: ConfigPayload;
  digest: string;
  reason: string;
  /** Null only for the migration's version-1 baseline (D-184). */
  createdByUserId: string | null;
  createdAt: Date;
}

export interface ListConfigVersionsInput {
  limit: number;
  /** The last version number of the previous page. */
  cursor?: number;
}

export interface ConfigVersionPage {
  versions: ConfigVersionRecord[];
  nextCursor: number | null;
}

export interface CreateConfigVersionInput {
  actorUserId: string;
  reason: string;
  /** Validated by the service through the pure rule before anything is written. */
  payload: unknown;
  requestId: string;
}

export interface ConfigService {
  /** The highest version, which is the one in force. */
  active(): Promise<ConfigVersionRecord | null>;
  /** Newest first, keyset on the version number. */
  list(input: ListConfigVersionsInput): Promise<ConfigVersionPage>;
  create(input: CreateConfigVersionInput): Promise<ConfigVersionRecord>;
}

export function configVersionPayload(record: ConfigVersionRecord): Record<string, unknown> {
  return {
    id: record.id,
    version: record.version,
    payload: record.payload,
    digest: record.digest,
    reason: record.reason,
    created_by_user_id: record.createdByUserId,
    created_at: record.createdAt,
  };
}
