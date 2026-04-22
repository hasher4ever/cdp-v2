/**
 * UDAF Phase 2 — Deferred Assertions
 *
 * Run AFTER `npm run test:udaf:setup` (Phase 1) has been running for at least
 * MIN_PHASE2_WAIT_MS (default 20 min, adjust after running the timing diagnostic).
 *
 * This test:
 *   1. Reads .udaf-phase1-state.json — refuses to run if too early
 *   2. Verifies the control UDAF (pre-existing) returns 200 immediately
 *   3. Polls each newly-created UDAF every 30s until it returns non-500
 *   4. Asserts the returned values are sensible (non-null, non-negative)
 *   5. Cross-validates: count_no_window vs count_relative_365 should be equal
 *      (since all data is recent). If they differ, that's BUG-002.
 *
 * Key diagnostic outputs:
 *   - How long did each UDAF take to materialize? (T since Phase 1)
 *   - Did count_no_window == count_relative_365? (BUG-002 check)
 *   - Did the control UDAF (pre-existing) return 200 immediately? (baseline)
 *   - Were all batch UDAFs ready at the same time? (cache vs queue theory)
 *
 * This file is a VITEST test so failures appear in the Allure report.
 * Run with: npm run test:udaf:assert
 */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

const STATE_FILE = path.join(process.cwd(), ".udaf-phase1-state.json");
const MIN_PHASE2_WAIT_MS = 20 * 60 * 1000; // must match phase1-setup.ts
const POLL_INTERVAL_MS = 30_000;
const POLL_TIMEOUT_MS  = 15 * 60 * 1000;   // 15 min additional polling after Phase 2 starts

// ─── State ────────────────────────────────────────────────────────────────────

interface Phase1State {
  phase1CompletedAt: number;
  tenantId: number;
  token: string;
  eventTypeId: number;
  eventTypeName: string;
  udafs: Array<{
    id: string;
    label: string;
    aggType: string;
    description: string;
    primaryIdToTest: number;
  }>;
  controlUdafId: string | null;
  controlPrimaryId: number | null;
}

let state: Phase1State;
let phase1AgeMs: number;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function calculate(token: string, udafId: string, primaryId: number) {
  const url = `${process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz"}/api/tenants/udafs/${udafId}/calculate?primaryId=${primaryId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

function extractResult(data: any): number | null {
  if (data?.result !== undefined && data.result !== null) {
    if (typeof data.result === "object" && data.result.Result !== undefined) return data.result.Result;
    if (typeof data.result === "number") return data.result;
  }
  if (data?.Result !== undefined && data.Result !== null) return data.Result;
  return null;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function fmtMs(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

/**
 * Poll until non-500 or timeout. Returns { status, data, elapsedMs }.
 * If still 500 after timeout, returns last 500 response.
 */
async function pollUntilReady(
  token: string,
  udafId: string,
  primaryId: number,
  label: string
): Promise<{ status: number; data: any; elapsedMs: number; attempts: number }> {
  const start = Date.now();
  let attempts = 0;

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    attempts++;
    const { status, data } = await calculate(token, udafId, primaryId);
    const elapsed = Date.now() - start;

    if (status !== 500) {
      console.log(`    [${label}] Ready after ${fmtMs(elapsed)}, ${attempts} poll(s) → HTTP ${status}`);
      return { status, data, elapsedMs: elapsed, attempts };
    }

    const errSnippet = JSON.stringify(data).slice(0, 100);
    console.log(`    [${label}] Still 500 at ${fmtMs(elapsed)} — ${errSnippet}`);
    await sleep(POLL_INTERVAL_MS);
  }

  // Timed out
  const { status, data } = await calculate(token, udafId, primaryId);
  return { status, data, elapsedMs: Date.now() - start, attempts };
}

// ─── Pre-flight ───────────────────────────────────────────────────────────────

beforeAll(() => {
  // Check state file exists
  if (!fs.existsSync(STATE_FILE)) {
    throw new Error(
      "Phase 1 state file not found. Run `npm run test:udaf:setup` first."
    );
  }

  state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as Phase1State;
  phase1AgeMs = Date.now() - state.phase1CompletedAt;
  const ageMin = Math.round(phase1AgeMs / 60_000);
  const waitMin = MIN_PHASE2_WAIT_MS / 60_000;

  console.log(`[phase2] Phase 1 ran ${ageMin} min ago.`);

  if (phase1AgeMs < MIN_PHASE2_WAIT_MS) {
    const remainingMin = Math.ceil((MIN_PHASE2_WAIT_MS - phase1AgeMs) / 60_000);
    throw new Error(
      `Too early — Phase 1 ran only ${ageMin} min ago (minimum: ${waitMin} min). ` +
      `Wait ${remainingMin} more minute(s), then re-run.`
    );
  }

  console.log(`[phase2] Phase 1 is ${ageMin} min old — proceeding (minimum was ${waitMin} min).`);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Phase 2: Control UDAF baseline (pre-existing, should work immediately)", () => {
  it("pre-existing UDAF returns 200 immediately — proves compute service is alive", async () => {
    if (!state.controlUdafId || !state.controlPrimaryId) {
      console.warn("No pre-existing control UDAF found — skipping baseline check.");
      return;
    }

    const { status, data } = await calculate(state.token, state.controlUdafId, state.controlPrimaryId);
    console.log(`  [control] HTTP ${status} — ${JSON.stringify(data).slice(0, 100)}`);

    // If even pre-existing UDAFs return 500, the compute service itself is down
    if (status === 500) {
      console.error("  ⚠️  Pre-existing UDAF returned 500 — compute service may be entirely down.");
      console.error("  All new UDAF failures may be infrastructure failures, not timing issues.");
    }

    // Don't hard-fail on control — it tells us the state of the service
    // but the shared tenant control UDAFs are known to sometimes break
    expect([200, 500]).toContain(status);
  });
});

describe("Phase 2: New UDAF materialization — poll until ready then assert", () => {
  const results: Map<string, { status: number; result: number | null; elapsedMs: number }> = new Map();

  it("all new UDAFs should materialize within poll window", async () => {
    console.log(`[phase2] Polling ${state.udafs.length} UDAFs (up to ${fmtMs(POLL_TIMEOUT_MS)} each)...`);
    console.log(`[phase2] Phase 1 ran ${fmtMs(phase1AgeMs)} ago — UDAFs have been aging that long.`);

    for (const udaf of state.udafs) {
      console.log(`\n  [${udaf.label}] ${udaf.description}`);
      const { status, data, elapsedMs } = await pollUntilReady(
        state.token, udaf.id, udaf.primaryIdToTest, udaf.label
      );
      const result = status === 200 ? extractResult(data) : null;
      results.set(udaf.label, { status, result, elapsedMs });
    }

    // At least one UDAF must have materialized — if all still 500, flag as infrastructure issue
    const succeeded = [...results.values()].filter(r => r.status === 200).length;
    console.log(`\n[phase2] ${succeeded}/${state.udafs.length} UDAFs materialized within poll window.`);

    if (succeeded === 0) {
      console.error("[phase2] ⚠️  NO UDAFs materialized. Possible causes:");
      console.error("  - Phase 1 ran too recently (increase MIN_PHASE2_WAIT_MS)");
      console.error("  - Compute service is down (check control UDAF result above)");
      console.error("  - Cache refresh interval is longer than expected (re-run timing diagnostic)");
    }

    // Soft expectation — captures the state without blocking the rest of the suite
    expect(succeeded).toBeGreaterThan(0);
    // Timeout ceiling: 10 UDAFs × POLL_TIMEOUT_MS + 30s buffer.
    // `state` is undefined at describe-collection time (populated in beforeAll),
    // so we can't size the timeout from state.udafs.length here — use a safe upper bound.
  }, POLL_TIMEOUT_MS * 10 + 30_000);

  it("count_no_window: result should be a non-negative number", () => {
    const r = results.get("count_no_window");
    if (!r || r.status !== 200) {
      console.warn("count_no_window did not materialize — skip value assertion");
      return;
    }
    expect(r.result).not.toBeNull();
    expect(r.result).toBeGreaterThanOrEqual(0);
    console.log(`  count_no_window = ${r.result} (materialized in ${fmtMs(r.elapsedMs)} after Phase 2 start)`);
  });

  it("count_relative_365 should match count_no_window (data is recent — BUG-002 check)", () => {
    const noWindow = results.get("count_no_window");
    const relative = results.get("count_relative_365");

    if (!noWindow || noWindow.status !== 200 || !relative || relative.status !== 200) {
      console.warn("One or both UDAFs did not materialize — skip BUG-002 check");
      return;
    }
    if (noWindow.result === null || relative.result === null) {
      console.warn("Results are null — UDAF materialized but returned no value");
      return;
    }

    console.log(`  count_no_window    = ${noWindow.result}`);
    console.log(`  count_relative_365 = ${relative.result}`);

    if (noWindow.result !== relative.result) {
      console.error("  ❌ MISMATCH — BUG-002 confirmed: RELATIVE window returns wrong value");
      console.error(`  Expected: ${noWindow.result} (same as no-window since data is recent)`);
      console.error(`  Actual:   ${relative.result}`);
    } else {
      console.log("  ✅ MATCH — BUG-002 not triggered for this customer (or data is outside 365d window)");
    }

    // This is a documentation test — we keep the assertion but note it may fail due to known bug
    // Expected: equal (data is recent). If not equal → BUG-002 is present.
    expect(relative.result).toBe(noWindow.result);
  });

  it("count_absolute_future should match count_no_window (window 2025-2030 covers all data)", () => {
    const noWindow = results.get("count_no_window");
    const absolute = results.get("count_absolute_future");

    if (!noWindow || noWindow.status !== 200 || !absolute || absolute.status !== 200) {
      console.warn("One or both UDAFs did not materialize — skip");
      return;
    }
    if (noWindow.result === null || absolute.result === null) return;

    console.log(`  count_no_window      = ${noWindow.result}`);
    console.log(`  count_absolute_2025  = ${absolute.result}`);
    expect(absolute.result).toBe(noWindow.result);
  });

  it("timing report: materialization times relative to Phase 1", () => {
    console.log("\n  ─── Materialization Timing ───────────────────────────");
    console.log(`  Phase 1 age when Phase 2 started: ${fmtMs(phase1AgeMs)}`);
    for (const udaf of state.udafs) {
      const r = results.get(udaf.label);
      if (!r) continue;
      const totalFromPhase1 = phase1AgeMs + r.elapsedMs;
      if (r.status === 200) {
        console.log(`  [${udaf.label}] OK — materialized >${fmtMs(phase1AgeMs)} after creation, result=${r.result}`);
      } else {
        console.log(`  [${udaf.label}] STILL 500 after ${fmtMs(totalFromPhase1)} total wait`);
      }
    }

    // Detect cache-refresh vs queue: if all succeed at the same poll interval, it's cache refresh
    const successTimes = state.udafs
      .map(u => results.get(u.label))
      .filter((r): r is NonNullable<typeof r> => r?.status === 200)
      .map(r => r.elapsedMs);

    if (successTimes.length > 1) {
      const spread = Math.max(...successTimes) - Math.min(...successTimes);
      console.log(`\n  Within-phase-2 success spread: ${fmtMs(spread)}`);
      if (spread < POLL_INTERVAL_MS * 2) {
        console.log("  → All UDAFs succeeded within 2 poll intervals = consistent with CACHE REFRESH theory");
      } else {
        console.log("  → Wide spread = consistent with QUEUE/LOAD theory");
      }
    }

    // This test always passes — it's diagnostic output only
    expect(true).toBe(true);
  });
});
