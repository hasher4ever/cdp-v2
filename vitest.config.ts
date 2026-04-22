import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 15_000,
    pool: "forks",
    fileParallelism: false,
    setupFiles: ["./tests_backend/setup.ts"],
    include: ["tests_backend/**/*.test.ts"],
    reporters: ["default", ["allure-vitest/reporter", { resultsDir: "allure-results" }]],
  },
});
