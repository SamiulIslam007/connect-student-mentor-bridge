/**
 * Container health route for the web tier (design.md D6). It is a static
 * response: no API call, no database, no request data.
 */
export const dynamic = "force-static";

export function GET(): Response {
  return Response.json({ status: "ok", service: "web" });
}
