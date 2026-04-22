import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  testDir: "./tests_e2e/specs",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    locale: "ru-RU",
  },
  projects: [
    { name: "setup", testDir: "./tests_e2e", testMatch: "auth.setup.ts" },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "auth-state.json",
      },
      dependencies: ["setup"],
    },
  ],
});
