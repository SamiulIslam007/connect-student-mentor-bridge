import { IdentityError, type AccountSummary, type IdentityService, type Role } from "@connect/domain";

import { bearerToken } from "../http/bearer.js";
import type { RequestWithId } from "../http/request-id.middleware.js";

/**
 * One authorization path (design D3). Roles are read from the database on every
 * request (design D4), never from the token or the body, so a revocation applies
 * to the very next request.
 */
export interface ActingAccount {
  account: AccountSummary;
  roles: Role[];
}

export async function actingAccountWithRoles(
  identity: IdentityService,
  request: RequestWithId,
): Promise<ActingAccount> {
  const account = await identity.getSession({ sessionToken: bearerToken(request) });
  if (!account) {
    throw new IdentityError("SESSION_INVALID", "the session is not valid");
  }
  return { account, roles: await identity.listRoles(account.id) };
}

export interface RequireRoleOptions {
  /** Refuse with `MFA_REQUIRED` when the account has no active second factor. */
  requiresMfa?: boolean;
}

/** An empty role set is a refusal, never a pass. */
export async function requireRole(
  identity: IdentityService,
  request: RequestWithId,
  role: Role,
  options: RequireRoleOptions = {},
): Promise<ActingAccount> {
  const acting = await actingAccountWithRoles(identity, request);

  if (!acting.roles.includes(role)) {
    throw new IdentityError("ROLE_REQUIRED", `this action requires the ${role.toLowerCase()} role`);
  }
  if (options.requiresMfa && !acting.account.mfaEnabled) {
    throw new IdentityError("MFA_REQUIRED", "this action requires an enrolled second factor");
  }
  return acting;
}
