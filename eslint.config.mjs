import js from "@eslint/js";
import tseslint from "typescript-eslint";

const frameworkFreeDomain = [
  {
    group: [
      "react",
      "react-*",
      "react/*",
      "next",
      "next/*",
      "@nestjs/*",
      "express",
      "pg",
      "@prisma/*",
    ],
    message:
      "packages/domain must stay pure TypeScript: no framework, database, HTTP, or app imports.",
  },
];

const noCrossApp = (peer) => [
  {
    group: [peer, `${peer}/*`],
    message: `App and service packages must not import from ${peer}.`,
  },
  {
    group: [`**/${peer}/**`],
    message: `App and service packages must not import from ${peer}, not even by relative path.`,
  },
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // Plain Node ESM entrypoints (container health check, ESLint config).
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        fetch: "readonly",
        AbortSignal: "readonly",
        console: "readonly",
      },
    },
  },
  {
    files: ["packages/domain/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: frameworkFreeDomain }] },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: noCrossApp("services/api") }] },
  },
  {
    files: ["services/api/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: noCrossApp("apps/web") }] },
  },
);
