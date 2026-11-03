/** A failure the caller caused (4xx) rather than an infrastructure fault. */
export function isClientApiError(error: unknown): boolean {
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" && statusCode >= 400 && statusCode < 500;
}
