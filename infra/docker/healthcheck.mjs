// Shared container health check: probes one or more local HTTP routes.
// Used by compose.yaml for the api (liveness + readiness) and web containers.
const port = process.env.PORT ?? "3000";
const paths = (process.env.HEALTHCHECK_PATHS ?? "/healthz").split(",");

const results = await Promise.allSettled(
  paths.map(async (path) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) {
      throw new Error(`${path} returned ${response.status}`);
    }
  }),
);

const failures = results.filter((result) => result.status === "rejected");
for (const failure of failures) {
  console.error(failure.reason?.message ?? failure.reason);
}
process.exit(failures.length === 0 ? 0 : 1);
