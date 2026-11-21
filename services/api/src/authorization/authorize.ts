import {
  IdentityError,
  requiresMfa,
  type AccountSummary,
  type IdentityService,
  type Role,
} from "@connect/domain";

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

export interface ActingAccountOptions {
  /**
   * Require an enrolled second factor when the account holds a role that needs
   * one (D-256). A student on a participant route is not blocked; a mentor is.
   */
  requiresMfa?: boolean;
}

export async function actingAccountWithRoles(
  identity: IdentityService,
  request: RequestWithId,
  options: ActingAccountOptions = {},
): Promise<ActingAccount> {
  const account = await identity.getSession({ sessionToken: bearerToken(request) });
  if (!account) {
    throw new IdentityError("SESSION_INVALID", "the session is not valid");
  }
  const roles = await identity.listRoles(account.id);
  if (options.requiresMfa && roles.some(requiresMfa) && !account.mfaEnabled) {
    throw new IdentityError("MFA_REQUIRED", "this action requires an enrolled second factor");
  }
  // The refusal is answered by the exception filter, which needs to know who was
  // refused; nothing is written here (D-152).
  request.actingAccount = { userId: account.id, roles };
  return { account, roles };
}

/** A sensitive action is one that only an admin role reaches (D-152). */
const SENSITIVE_ROLES: readonly Role[] = ["PLATFORM_ADMIN", "INSTITUTION_ADMIN"];

function noteSensitiveDenial(request: RequestWithId, role: Role): void {
  if (SENSITIVE_ROLES.includes(role)) {
    request.sensitiveDenial = { requiredRole: role };
  }
}

/** A caller that administers at least one institution, with that scope. */
export interface ActingInstitutionAdmin extends ActingAccount {
  /** The institution ids the account actively administers. */
  institutionIds: string[];
}

/**
 * The one scope rule for every institution route (D-98): the role is read from
 * the database on each request, an empty scope is a refusal, and the role
 * always needs an enrolled second factor.
 */
export async function requireInstitutionAdmin(
  identity: IdentityService,
  request: RequestWithId,
): Promise<ActingInstitutionAdmin> {
  const acting = await requireRole(identity, request, "INSTITUTION_ADMIN", { requiresMfa: true });
  const institutionIds = (await identity.listInstitutionAdminScopes(acting.account.id)).filter(
    (id): id is string => typeof id === "string",
  );
  if (institutionIds.length === 0) {
    noteSensitiveDenial(request, "INSTITUTION_ADMIN");
    throw new IdentityError("ROLE_REQUIRED", "this action requires an institution scope");
  }
  return { ...acting, institutionIds };
}

export interface ScopedInstitutionAdmin extends ActingInstitutionAdmin {
  /** The one institution this request named, proven to be in scope. */
  institutionId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The aggregates read is scoped to one institution the caller administers
 * (D-212). An id that names nothing and an id the caller does not administer
 * answer the same `404`, so the parameter cannot be an existence oracle; a
 * missing or malformed id is a `422`, never a refusal by role.
 */
export async function requireScopedInstitution(
  identity: IdentityService,
  request: RequestWithId,
  requestedId: unknown,
): Promise<ScopedInstitutionAdmin> {
  const acting = await requireInstitutionAdmin(identity, request);
  const institutionId = typeof requestedId === "string" ? requestedId : "";
  if (!UUID_PATTERN.test(institutionId)) {
    throw new IdentityError("VALIDATION_ERROR", "institution_id must be a uuid");
  }
  if (!acting.institutionIds.includes(institutionId)) {
    throw new IdentityError("INSTITUTION_NOT_FOUND", "no institution matches this request");
  }
  return { ...acting, institutionId };
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
    noteSensitiveDenial(request, role);
    throw new IdentityError("ROLE_REQUIRED", `this action requires the ${role.toLowerCase()} role`);
  }
  if (options.requiresMfa && !acting.account.mfaEnabled) {
    noteSensitiveDenial(request, role);
    throw new IdentityError("MFA_REQUIRED", "this action requires an enrolled second factor");
  }
  return acting;
}
