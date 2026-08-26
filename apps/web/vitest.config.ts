import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Domain logic lives in @form/core; here we only test the storage layer.
    // UI is covered end-to-end by Playwright rather than by shallow tests.
    include: ["db/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
