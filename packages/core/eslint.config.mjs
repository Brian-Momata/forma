import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * The boundary rule from ENGINEERING.md §2, as a lint gate.
 *
 * `boundaries.test.ts` also enforces it by scanning source, which catches
 * `Date.now` and timers too. This is the faster half: it fails in the editor
 * rather than in a test run.
 */
export default tseslint.config(
  { ignores: ["**/*.json", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "react-dom/*", "next", "next/*"],
              message: "packages/core is pure domain: no framework code (ENGINEERING.md §2).",
            },
            {
              group: ["dexie", "zustand", "@form/web", "@form/web/*"],
              message: "packages/core must not reach for storage or the app (ENGINEERING.md §2).",
            },
            {
              group: ["node:*", "fs", "path", "crypto"],
              message: "packages/core ships to a browser and a native runtime: no node builtins.",
            },
          ],
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  }
);
