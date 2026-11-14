import { NextResponse } from "next/server";

// Five levels: admins, [id], institutions, api, app.
import { proxyJson, unauthenticated } from "../../../../../lib/bff";
import { readSessionCookie } from "../../../../../lib/session-cookie";
import { requireCsrf } from "../../../../../lib/csrf";

/**
 * `POST /api/institutions/{id}/admins` — assign the institution admin. The
 * allowlist, the PLATFORM_ADMIN role, the second factor and the
 * existing-account refusal all stay the API's.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return unauthenticated();
  }
  const refused = requireCsrf(request);
  if (refused) {
    return refused;
  }

  const { id } = await context.params;
  return proxyJson(`/v1/admin/institutions/${id}/admins`, request, {
    sessionToken: token,
    method: "POST",
  });
}
