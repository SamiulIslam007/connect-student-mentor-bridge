import { Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";

import type { IdentityService, Role } from "@connect/domain";

import { actingAccountWithRoles } from "../authorization/authorize.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../identity/identity.tokens.js";

/**
 * `POST /v1/me/roles/mentor` (docs/api-contracts.md §5.1).
 *
 * The account always comes from the session, so a body cannot grant a role to
 * anyone else. The role alone grants no visibility, no activation, and no
 * discoverability (spec: the role alone grants nothing).
 */
@Controller("v1/me/roles")
export class MeRolesController {
  constructor(@Inject(IDENTITY_SERVICE) private readonly identity: IdentityService) {}

  @Post("mentor")
  @HttpCode(200)
  async grantMentor(@Req() request: RequestWithId): Promise<{ roles: Role[] }> {
    const acting = await actingAccountWithRoles(this.identity, request);
    const roles = await this.identity.grantRole({
      userId: acting.account.id,
      role: "MENTOR",
      actorUserId: acting.account.id,
      requestId: request.requestId,
    });
    return { roles };
  }
}
