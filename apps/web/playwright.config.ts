import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3111",
    // The app is designed for a phone, so test at a phone viewport. The device
    // preset would pull in WebKit; Chromium is what is installed here.
    ...devices["Pixel 7"],
    browserName: "chromium",
    trace: "off",
  },
  webServer: {
    command: "npx next dev --port 3111",
    url: "http://localhost:3111",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
