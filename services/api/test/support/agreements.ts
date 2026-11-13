import type { Client } from "pg";

import { CONSENT_DOCUMENT_VERSION } from "@connect/config";

/**
 * The precondition a mentor now needs to be ACTIVE (D-127): the two documents
 * accepted and the orientation stamped. Tests that only need the state use this
 * instead of driving the consent route, which `consent.integration.test.ts` owns.
 * `emailOrId` accepts either, because a fixture usually holds the email.
 */
export async function grantMentorAgreements(client: Client, emailOrId: string): Promise<void> {
  await client.query(
    `INSERT INTO consent_records (user_id, purpose, action, document_version)
     SELECT u.id, p.purpose::consent_purpose, 'GRANTED'::consent_action, $2::text
       FROM users u
       CROSS JOIN (VALUES ('VOLUNTEER_AGREEMENT'), ('COMMUNITY_GUIDELINES')) AS p(purpose)
      WHERE u.email = $1 OR u.id = $1`,
    [emailOrId, CONSENT_DOCUMENT_VERSION],
  );
  await client.query(
    `UPDATE mentor_profiles SET orientation_completed_at = now()
      WHERE orientation_completed_at IS NULL
        AND user_id IN (SELECT id FROM users WHERE email = $1 OR id = $1)`,
    [emailOrId],
  );
}
