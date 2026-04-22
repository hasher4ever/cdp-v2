import { defineConfig } from "vitest/config";

// Phase 2 config — runs only udaf-phase2-assert.test.ts
// No globalSetup — state comes from .udaf-phase1-state.json written by Phase 1
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Generous timeout: POLL_TIMEOUT_MS (15min) × n_udafs (3) + buffer
    testTimeout: 60 * 60 * 1000, // 1 hour absolute ceiling
    hookTimeout: 60_000,
    pool: "forks",
    setupFiles: ["./tests_backend/setup.ts"],
    include: ["tests_backend/udaf-phase2-assert.test.ts"],
    sequence: { concurrent: false },
    reporters: ["default", ["allure-vitest/reporter", { resultsDir: "allure-results" }]],
  },
});
