/**
 * Smoke-only Playwright config — no auth.setup dependency. For diagnosing the
 * browser-launch hang without the full login pipeline in the way.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests_e2e/specs",
  testMatch: "_smoke.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    headless: true,
    screenshot: "only-on-failure",
    trace: "off",
    video: "off",
  },
  projects: [
    {
      name: "smoke-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
