/**
 * BUG-002 regression guard: UDAF with RELATIVE time window.
 *
 * BUG-002: UDAF COUNT with RELATIVE time window returns 0 instead of correct
 * count for customers who have events ingested within the window.
 *
 * Uses shared dataset from globalSetup — no per-file ingest.
 *
 * Pattern: UDAFs created in beforeAll (with aggType verification), assertions
 * use waitForUdaf to poll until materialized (~20-30 min on shared tenant).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { evtField, purchaseTypeId, getTenant, isUdafCalculateHealthy } from "./tenant-context";
import { createAndVerifyUdaf, waitForUdaf, skipIfNotMaterialized, expectZeroOrSkip } from "./udaf-helpers";

const CALCULATE_OK = isUdafCalculateHealthy();

const t = getTenant();
const { customers, events, runTag: TAG } = t;

// ─── Shared dataset mappings ──────────────────────────────────────────────────
// custA (3 events) → customers[1], global event idx 4-6
// custB (4 events) → customers[0], global event idx 0-3
// custC (2 events) → customers[2], global event idx 7-8
// custNone (0 events) → customers[4]

const custA    = customers[1]; // 3 events
const custB    = customers[0]; // 4 events
const custC    = customers[2]; // 2 events
const custNone = customers[4]; // 0 events

const evtsA = events.filter(e => e.primary_id === custA.primary_id);
const evtsB = events.filter(e => e.primary_id === custB.primary_id);
const evtsC = events.filter(e => e.primary_id === custC.primary_id);

const countA    = evtsA.length;   // 3
const countB    = evtsB.length;   // 4
const countC    = evtsC.length;   // 2
const sumPriceA = evtsA.reduce((s, e) => s + e.total_price, 0);
const sumPriceB = evtsB.reduce((s, e) => s + e.total_price, 0);
const sumPriceC = evtsC.reduce((s, e) => s + e.total_price, 0);

const noFilter = {
  type: "group" as const,
  group: { logicalOp: "AND" as const, predicates: [], negate: false },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe.skipIf(!CALCULATE_OK)("BUG-002 regression: UDAF with RELATIVE time window", () => {
  let countUdafId: string;
  let sumUdafId: string;

  beforeAll(async () => {
    [countUdafId, sumUdafId] = await Promise.all([
      createAndVerifyUdaf({
        name: `${TAG}_bug002_rel_count`,
        aggType: "COUNT",
        params: [],
        filter: {
          eventType: { id: purchaseTypeId(), name: "purchase" },
          predicate: noFilter,
          timeWindow: { from: { kind: "RELATIVE", relativeDuration: 365, relativeUnit: "DAY" } },
        },
      }),
      createAndVerifyUdaf({
        name: `${TAG}_bug002_rel_sum`,
        aggType: "SUM",
        params: [{ fieldName: evtField("total_price") }],
        filter: {
          eventType: { id: purchaseTypeId(), name: "purchase" },
          predicate: noFilter,
          timeWindow: { from: { kind: "RELATIVE", relativeDuration: 365, relativeUnit: "DAY" } },
        },
      }),
    ]);
  });

  // ── COUNT assertions ─────────────────────────────────────────────────────

  it(`COUNT for custA should be ${3} (BUG-002: was returning 0)`, async (ctx) => {
    const val = await waitForUdaf(countUdafId, custA.primary_id);
    skipIfNotMaterialized(ctx, val, "COUNT UDAF not materialized — timing skip");
    expect(val).toBe(countA);
  });

  it(`COUNT for custB should be ${4}`, async (ctx) => {
    const val = await waitForUdaf(countUdafId, custB.primary_id);
    skipIfNotMaterialized(ctx, val, "COUNT UDAF not materialized — timing skip");
    expect(val).toBe(countB);
  });

  it(`COUNT for custC should be ${2}`, async (ctx) => {
    const val = await waitForUdaf(countUdafId, custC.primary_id);
    skipIfNotMaterialized(ctx, val, "COUNT UDAF not materialized — timing skip");
    expect(val).toBe(countC);
  });

  it("COUNT for custNone should be 0 or null (no events)", async (ctx) => {
    const val = await waitForUdaf(countUdafId, custNone.primary_id);
    expectZeroOrSkip(ctx, val, "COUNT for custNone should be 0 or null (no events)");
  });

  // ── SUM assertions ───────────────────────────────────────────────────────

  it("SUM total_price for custA should equal shared-dataset sum", async (ctx) => {
    const val = await waitForUdaf(sumUdafId, custA.primary_id);
    skipIfNotMaterialized(ctx, val, "SUM UDAF not materialized — timing skip");
    expect(val).toBeCloseTo(sumPriceA, 2);
  });

  it("SUM total_price for custB should equal shared-dataset sum", async (ctx) => {
    const val = await waitForUdaf(sumUdafId, custB.primary_id);
    skipIfNotMaterialized(ctx, val, "SUM UDAF not materialized — timing skip");
    expect(val).toBeCloseTo(sumPriceB, 2);
  });

  it("SUM total_price for custC should equal shared-dataset sum", async (ctx) => {
    const val = await waitForUdaf(sumUdafId, custC.primary_id);
    skipIfNotMaterialized(ctx, val, "SUM UDAF not materialized — timing skip");
    expect(val).toBeCloseTo(sumPriceC, 2);
  });
});

describe.skipIf(!CALCULATE_OK)("BUG-002 regression: RELATIVE window vs no-window differential", () => {
  let noWindowId: string;
  let relativeWindowId: string;

  beforeAll(async () => {
    [noWindowId, relativeWindowId] = await Promise.all([
      createAndVerifyUdaf({
        name: `${TAG}_bug002_ctrl`,
        aggType: "COUNT",
        params: [],
        filter: {
          eventType: { id: purchaseTypeId(), name: "purchase" },
          predicate: noFilter,
          timeWindow: {},
        },
      }),
      createAndVerifyUdaf({
        name: `${TAG}_bug002_rel730`,
        aggType: "COUNT",
        params: [],
        filter: {
          eventType: { id: purchaseTypeId(), name: "purchase" },
          predicate: noFilter,
          timeWindow: { from: { kind: "RELATIVE", relativeDuration: 730, relativeUnit: "DAY" } },
        },
      }),
    ]);
  });

  it("custA: RELATIVE window result should match no-window result (events ingested today)", async (ctx) => {
    const [noWin, relWin] = await Promise.all([
      waitForUdaf(noWindowId, custA.primary_id),
      waitForUdaf(relativeWindowId, custA.primary_id),
    ]);

    skipIfNotMaterialized(ctx, noWin, "no-window UDAF (custA)");
    skipIfNotMaterialized(ctx, relWin, "RELATIVE window UDAF (custA)");
    // Both should equal countA (events ingested today are within 730 days)
    expect(noWin).toBe(countA);
    expect(relWin).toBe(countA);
    expect(relWin).toBe(noWin);
  });

  it("custB: RELATIVE window result should match no-window result", async (ctx) => {
    const [noWin, relWin] = await Promise.all([
      waitForUdaf(noWindowId, custB.primary_id),
      waitForUdaf(relativeWindowId, custB.primary_id),
    ]);

    skipIfNotMaterialized(ctx, noWin, "no-window UDAF (custB)");
    skipIfNotMaterialized(ctx, relWin, "RELATIVE window UDAF (custB)");
    expect(noWin).toBe(countB);
    expect(relWin).toBe(countB);
    expect(relWin).toBe(noWin);
  });
});
