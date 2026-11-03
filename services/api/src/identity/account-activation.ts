import { and, eq } from "drizzle-orm";

import type { Database } from "../db/database.js";
import { auditLogs, users } from "../db/schema/index.js";

/**
 * The one activation write (design D1). `WHERE status = 'PENDING'` is what makes
 * "activation never reverses another state" true rather than intended, and makes
 * a replayed verification link a no-op. Shared by the library's verification
 * hook and `IdentityService.activateAccount`.
 */
export async function activatePendingAccount(
  database: Database,
  userId: string,
  requestId: string,
): Promise<void> {
  await database.transaction(async (tx) => {
    const activated = await tx
      .update(users)
      .set({ status: "ACTIVE" })
      .where(and(eq(users.id, userId), eq(users.status, "PENDING")))
      .returning({ id: users.id });

    if (activated.length === 0) {
      return;
    }

    await tx.insert(auditLogs).values({
      action: "ACCOUNT_ACTIVATED",
      actorUserId: userId,
      actorRole: "USER",
      objectType: "users",
      objectId: userId,
      requestId,
      metadata: { from_status: "PENDING" },
    });
  });
}

/**
 * Deactivation is a pause; signing in ends it (design D5, D-36). Returns false
 * when the account was no longer `DEACTIVATED`, which means a concurrent
 * suspension won the race and the caller must refuse rather than allow.
 */
export async function resumeDeactivatedAccount(
  database: Database,
  userId: string,
  requestId: string,
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const resumed = await tx
      .update(users)
      .set({ status: "ACTIVE" })
      .where(and(eq(users.id, userId), eq(users.status, "DEACTIVATED")))
      .returning({ id: users.id });

    if (resumed.length === 0) {
      return false;
    }

    await tx.insert(auditLogs).values({
      action: "ACCOUNT_ACTIVATED",
      actorUserId: userId,
      actorRole: "USER",
      objectType: "users",
      objectId: userId,
      requestId,
      // Same action as verification; the origin is what tells them apart.
      metadata: { from_status: "DEACTIVATED" },
    });
    return true;
  });
}
