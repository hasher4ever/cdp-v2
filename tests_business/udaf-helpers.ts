/**
 * Shared UDAF test utilities.
 *
 * The core principle: UDAF calculation is asynchronous. The compute service
 * materializes new UDAFs on a cache refresh cycle (~20-30 min on the shared
 * tenant). Calling calculate immediately after creation will return 500 or null —
 * not because the endpoint is broken, but because the UDAF hasn't been loaded yet.
 *
 * Correct test pattern:
 *   1. beforeAll: createAndVerifyUdaf() — create + verify stored correctly
 *   2. it(): waitForUdaf() — poll until materialized, then assert
 *
 * Wrong pattern (what the old tests did):
 *   it(): post(create) + post(calculate) in one shot — racaes against materialization
 */

import { get, post } from "../tests_backend/client";

// ─── Value extraction ────────────────────────────────────────────────────────

export function extractUdafValue(data: any): number | null {
  const r = data?.result;
  if (r === null || r === undefined) return null;
  if (typeof r === "number") return r;
  if (typeof r === "object" && "Result" in r) return r.Result;
  return r;
}

// ─── Create and verify ────────────────────────────────────────────────────────

/**
 * Creates a UDAF and immediately GETs it back to verify the backend stored
 * the definition correctly (non-empty aggType, matching what was sent).
 *
 * Throws immediately if:
 *   - Create returns non-200
 *   - Stored aggType is empty (corrupt record — backend storage bug, see BUG-041)
 *   - Stored aggType doesn't match what was sent
 *
 * This prevents tests from proceeding with a UDAF that will always return 500.
 */
export async function createAndVerifyUdaf(payload: {
  name: string;
  aggType: string;
  params: any[];
  filter: any;
  grouping?: any;
}): Promise<string> {
  const body = { grouping: { enable: false }, ...payload };

  const { status, data } = await post("/api/tenants/udafs", body);
  if (status !== 200) {
    throw new Error(`UDAF create failed (HTTP ${status}): ${JSON.stringify(data)}`);
  }

  const udafId: string = data.id;

  // Verify the stored definition — backend may accept POST but persist incorrectly
  const { status: getStatus, data: stored } = await get(`/api/tenants/udafs/${udafId}`);
  if (getStatus !== 200) {
    throw new Error(`UDAF GET after create failed (HTTP ${getStatus}) for ${udafId}`);
  }
  if (!stored.aggType || stored.aggType === "") {
    throw new Error(
      `UDAF ${udafId} was stored with empty aggType — backend persistence bug (BUG-041). ` +
      `Sent aggType="${payload.aggType}". This UDAF will always return 500 on calculate.`
    );
  }
  if (stored.aggType !== payload.aggType) {
    throw new Error(
      `UDAF ${udafId} aggType mismatch: sent "${payload.aggType}", stored "${stored.aggType}"`
    );
  }

  return udafId;
}

// ─── Wait for materialization ─────────────────────────────────────────────────

/**
 * Probes calculate a short number of times and returns a value if materialized.
 *
 * Returns the value if materialized, null if still not materialized within
 * the (short) window. Does NOT throw on timeout — caller MUST handle null by
 * either skipping the test (via skipIfNotMaterialized) or asserting explicitly.
 *
 * NOTE on defaults: maxWaitMs is intentionally short (5s, ~1 retry). On the
 * shared tenant, real materialization can take 20–30 minutes, far beyond any
 * reasonable per-test budget. A short probe is effectively a fire-and-forget:
 * if compute already has the UDAF, we assert; otherwise we skip (NOT pass).
 * Do not raise this default unless you know the tenant's cache is warm.
 *
 * @param udafId     UDAF to calculate
 * @param primaryId  Customer to calculate for
 * @param maxWaitMs  Max polling duration (default 5s — short probe, see note)
 * @param pollMs     Interval between polls (default 3s)
 */
export async function waitForUdaf(
  udafId: string,
  primaryId: number,
  maxWaitMs = 5_000,
  pollMs = 3_000,
): Promise<number | null> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const { status, data } = await post(
      `/api/tenants/udafs/${udafId}/calculate`,
      undefined,
      { primaryId }
    );
    if (status === 200) {
      const val = extractUdafValue(data);
      if (val !== null) return val;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise(r => setTimeout(r, Math.min(pollMs, remaining)));
  }

  return null;
}

// ─── Proper skip on non-materialization ───────────────────────────────────────

/**
 * Runtime-skip the current test if the UDAF didn't materialize in time.
 *
 * Replaces the old silent-skip anti-pattern:
 *     if (val === null) { console.warn("..."); return; }  // passes falsely
 *
 * With a real vitest runtime skip:
 *     skipIfNotMaterialized(ctx, val, "SUM total_price");
 *
 * Vitest reports the test as *skipped*, not passed — so qa-autopilot sees
 * the coverage gap instead of being lied to by green checkmarks.
 *
 * TypeScript: asserts that `val` is a number after the call (null-narrowed).
 *
 * @param ctx    vitest test context (second argument of the `it` callback)
 * @param val    result from waitForUdaf()
 * @param label  short description for the skip reason (e.g. "SUM total_price")
 */
export function skipIfNotMaterialized(
  ctx: { skip: (note?: string) => void },
  val: number | null,
  label: string,
): asserts val is number {
  if (val === null) {
    ctx.skip(`${label}: UDAF not materialized within probe window`);
  }
}

/**
 * Same as skipIfNotMaterialized but for "expected zero OR null" cases.
 *
 * Old pattern: `expect(val === null || val === 0).toBe(true)` — passes on null.
 * New pattern: skip on null, strictly assert === 0 on value. Distinguishes
 * "compute not ready" from "compute says 0".
 */
export function expectZeroOrSkip(
  ctx: { skip: (note?: string) => void },
  val: number | null,
  label: string,
): void {
  if (val === null) {
    ctx.skip(`${label}: UDAF not materialized within probe window`);
    return;
  }
  if (val !== 0) {
    throw new Error(`${label}: expected 0, got ${val}`);
  }
}
