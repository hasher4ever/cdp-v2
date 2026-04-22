import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 900_000,
    pool: "forks",
    fileParallelism: false,
    setupFiles: ["./tests_backend/setup.ts"],
    globalSetup: ["./tests_business/global-setup-shared.ts"],
    include: ["tests_business/**/*.test.ts"],
    sequence: { concurrent: false },
    reporters: ["default", ["allure-vitest/reporter", { resultsDir: "allure-results" }]],
  },
});
