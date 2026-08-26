import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Domain logic lives in @form/core; here we test the storage layer and the
    // pure helpers that sit between it and the screens. Components themselves
    // are covered end-to-end by Playwright rather than by shallow tests.
    include: ["db/**/*.test.ts", "lib/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
