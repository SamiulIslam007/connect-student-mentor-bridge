/**
 * Shared response shapes for the operational endpoints. The OpenAPI source in
 * `openapi.yaml` is the contract of record; these types keep the API and the
 * generated client honest until request/response schemas are generated.
 */
export interface HealthResponse {
  status: "ok";
  service: "api";
}

export interface ReadinessResponse {
  status: "ok" | "unavailable";
  checks: Record<string, "ok" | "unavailable">;
}
