import { defineConfig } from "tsup";

export default defineConfig({
  entry: { main: "src/main.ts", worker: "src/worker.ts" },
  format: ["cjs"],
  platform: "node",
  target: "node24",
  clean: true,
  sourcemap: false,
  // Shared workspace packages export TypeScript source, so the API build
  // compiles them in; third-party dependencies stay external and are installed
  // in the runtime image.
  noExternal: [/^@connect\//],
});
