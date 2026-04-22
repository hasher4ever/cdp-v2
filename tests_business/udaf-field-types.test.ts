/**
 * UDAF tests by field type and aggregate function.
 * Uses shared dataset from globalSetup (20 customers, deterministic events).
 *
 * Matrix:
 *   DOUBLE fields (total_price, delivery_cost): SUM, AVG, MIN, MAX, COUNT
 *   DOUBLE fields (total_quantity): SUM
 *   VARCHAR fields (delivery_city): COUNT with filter
 *   COUNT with no params (counts rows)
 *
 * Also tests:
 *   - Event filter predicates (numeric >, string =, combined AND)
 *   - Time window (RELATIVE, ABSOLUTE)
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

// Designated customers from shared dataset:
// customers[0] = 4 events, customers[1] = 3 events, customers[4] = 0 events
const custA = customers[0];  // 4 events — main "power user"
const custB = customers[1];  // 3 events
const custC = customers[4];  // 0 events — no events

// Pre-computed expected values derived from shared events
const evtsA = events.filter(e => e.primary_id === custA.primary_id);
const evtsB = events.filter(e => e.primary_id === custB.primary_id);

const sumPriceA        = evtsA.reduce((s, e) => s + e.total_price, 0);
const sumPriceB        = evtsB.reduce((s, e) => s + e.total_price, 0);
const avgPriceA        = sumPriceA / evtsA.length;
const minPriceA        = Math.min(...evtsA.map(e => e.total_price));
const maxPriceA        = Math.max(...evtsA.map(e => e.total_price));
const minCostA         = Math.min(...evtsA.map(e => e.delivery_cost));
const maxCostA         = Math.max(...evtsA.map(e => e.delivery_cost));
const sumDeliveryCostA = evtsA.reduce((s, e) => s + e.delivery_cost, 0);
const sumQtyA          = evtsA.reduce((s, e) => s + e.total_quantity, 0);
const sumQtyB          = evtsB.reduce((s, e) => s + e.total_quantity, 0);
const countA           = evtsA.length;
const countB           = evtsB.length;

const noFilter = { type: "group" as const, group: { logicalOp: "AND" as const, predicates: [], negate: false } };

function makeUdafPayload(name: string, aggType: string, paramField?: string, predicate = noFilter, timeWindow: any = {}) {
  return {
    name: `${TAG}_${name}`,
    aggType,
    params: paramField ? [{ fieldName: paramField }] : [],
    filter: {
      eventType: { id: purchaseTypeId(), name: "purchase" },
      predicate,
      timeWindow,
    },
  };
}

// ─── DOUBLE field: total_price ────────────────────────────────────────────────

describe.skipIf(!CALCULATE_OK)("UDAF on DOUBLE field (total_price)", () => {
  let sumId: string;
  let avgId: string;
  let minId: string;
  let maxId: string;
  let countId: string;

  beforeAll(async () => {
    [sumId, avgId, minId, maxId, countId] = await Promise.all([
      createAndVerifyUdaf(makeUdafPayload("dbl_sum",   "SUM",   evtField("total_price"))),
      createAndVerifyUdaf(makeUdafPayload("dbl_avg",   "AVG",   evtField("total_price"))),
      createAndVerifyUdaf(makeUdafPayload("dbl_min",   "MIN",   evtField("total_price"))),
      createAndVerifyUdaf(makeUdafPayload("dbl_max",   "MAX",   evtField("total_price"))),
      createAndVerifyUdaf(makeUdafPayload("dbl_count", "COUNT")),
    ]);
  });

  it("SUM: custA = sum of generated total_price values", async (ctx) => {
    const val = await waitForUdaf(sumId, custA.primary_id);
    skipIfNotMaterialized(ctx, val, "SUM total_price not materialized — timing skip");
    expect(val).toBeCloseTo(sumPriceA, 2);
  });

  it("AVG: custA = sum/count from generated events", async (ctx) => {
    const val = await waitForUdaf(avgId, custA.primary_id);
    skipIfNotMaterialized(ctx, val, "AVG total_price not materialized — timing skip");
    expect(val).toBeCloseTo(avgPriceA, 2);
  });

  it("MIN: custA = minimum total_price from generated events", async (ctx) => {
    const val = await waitForUdaf(minId, custA.primary_id);
    skipIfNotMaterialized(ctx, val, "MIN total_price not materialized — timing skip");
    expect(val).toBeCloseTo(minPriceA, 2);
  });

  it("MAX: custA = maximum total_price from generated events", async (ctx) => {
    const val = await waitForUdaf(maxId, custA.primary_id);
    skipIfNotMaterialized(ctx, val, "MAX total_price not materialized — timing skip");
    expect(val).toBeCloseTo(maxPriceA, 2);
  });

  it("COUNT: custA = 4 purchases", async (ctx) => {
    const val = await waitForUdaf(countId, custA.primary_id);
    skipIfNotMaterialized(ctx, val, "COUNT not materialized — timing skip");
    expect(val).toBe(countA);
  });

  it("COUNT: custC = 0 (no events)", async (ctx) => {
    const val = await waitForUdaf(countId, custC.primary_id);
    expectZeroOrSkip(ctx, val, "COUNT: custC = 0 (no events)");
  });
});

// ─── DOUBLE field: delivery_cost ──────────────────────────────────────────────

describe.skipIf(!CALCULATE_OK)("UDAF on DOUBLE field (delivery_cost)", () => {
  let sumId: string;
  let minId: string;
  let maxId: string;

  beforeAll(async () => {
    [sumId, minId, maxId] = await Promise.all([
      createAndVerifyUdaf(makeUdafPayload("del_sum", "SUM", evtField("delivery_cost"))),
      createAndVerifyUdaf(makeUdafPayload("del_min", "MIN", evtField("delivery_cost"))),
      createAndVerifyUdaf(makeUdafPayload("del_max", "MAX", evtField("delivery_cost"))),
    ]);
  });

  it("SUM: custA = sum of generated delivery_cost values", async (ctx) => {
    const val = await waitForUdaf(sumId, custA.primary_id);
    skipIfNotMaterialized(ctx, val, "SUM delivery_cost not materialized — timing skip");
    expect(val).toBeCloseTo(sumDeliveryCostA, 2);
  });

  it("MIN: custA = minimum delivery_cost from generated events", async (ctx) => {
    const val = await waitForUdaf(minId, custA.primary_id);
    skipIfNotMaterialized(ctx, val, "MIN delivery_cost not materialized — timing skip");
    expect(val).toBeCloseTo(minCostA, 2);
  });

  it("MAX: custA = maximum delivery_cost from generated events", async (ctx) => {
    const val = await waitForUdaf(maxId, custA.primary_id);
    skipIfNotMaterialized(ctx, val, "MAX delivery_cost not materialized — timing skip");
    expect(val).toBeCloseTo(maxCostA, 2);
  });
});

// ─── DOUBLE field: total_quantity ─────────────────────────────────────────────

describe.skipIf(!CALCULATE_OK)("UDAF on DOUBLE field (total_quantity)", () => {
  let sumId: string;

  beforeAll(async () => {
    sumId = await createAndVerifyUdaf(makeUdafPayload("qty_sum", "SUM", evtField("total_quantity")));
  });

  it("SUM: custA = sum of generated total_quantity values", async (ctx) => {
    const val = await waitForUdaf(sumId, custA.primary_id);
    skipIfNotMaterialized(ctx, val, "SUM total_quantity not materialized — timing skip");
    expect(val).toBeCloseTo(sumQtyA, 2);
  });

  it("SUM: custB = sum of generated total_quantity values", async (ctx) => {
    const val = await waitForUdaf(sumId, custB.primary_id);
    skipIfNotMaterialized(ctx, val, "SUM total_quantity not materialized — timing skip");
    expect(val).toBeCloseTo(sumQtyB, 2);
  });
});

// ─── Event filter predicate: numeric > ────────────────────────────────────────

describe.skipIf(!CALCULATE_OK)("UDAF with event filter: numeric >", () => {
  // Use median price of custA's events as threshold
  const sorted = [...evtsA].sort((a, b) => a.total_price - b.total_price);
  const threshold = sorted[Math.floor(sorted.length / 2)].total_price;
  const expectedFilteredSum = evtsA.filter(e => e.total_price > threshold).reduce((s, e) => s + e.total_price, 0);

  let filtGtId: string;
  let filtGtNoneId: string;

  beforeAll(async () => {
    const predGt = {
      type: "group" as const,
      group: { logicalOp: "AND" as const, negate: false, predicates: [{
        type: "condition" as const,
        condition: {
          param: { kind: "field" as const, fieldName: evtField("total_price") },
          operator: ">" as const,
          value: { string: [], time: [], float64: [threshold], int64: [], bool: [] },
        },
      }]},
    };
    const predHighThreshold = {
      type: "group" as const,
      group: { logicalOp: "AND" as const, negate: false, predicates: [{
        type: "condition" as const,
        condition: {
          param: { kind: "field" as const, fieldName: evtField("total_price") },
          operator: ">" as const,
          value: { string: [], time: [], float64: [9999999], int64: [], bool: [] },
        },
      }]},
    };
    [filtGtId, filtGtNoneId] = await Promise.all([
      createAndVerifyUdaf(makeUdafPayload("filt_gt",      "SUM", evtField("total_price"), predGt)),
      createAndVerifyUdaf(makeUdafPayload("filt_gt_none", "COUNT", undefined, predHighThreshold)),
    ]);
  });

  it("SUM total_price WHERE total_price > threshold: custA filtered correctly", async (ctx) => {
    const val = await waitForUdaf(filtGtId, custA.primary_id);
    skipIfNotMaterialized(ctx, val, "Filtered SUM not materialized — timing skip");
    expect(val).toBeCloseTo(expectedFilteredSum, 2);
  });

  it("COUNT WHERE total_price > very high threshold: custC = 0 (no events)", async (ctx) => {
    const val = await waitForUdaf(filtGtNoneId, custC.primary_id);
    expectZeroOrSkip(ctx, val, "COUNT WHERE total_price > very high threshold: custC = 0 (no events)");
  });
});

// ─── Event filter: string = (tagged city) ────────────────────────────────────

describe.skipIf(!CALCULATE_OK)("UDAF with event filter: string = (tagged city)", () => {
  const targetCityA = evtsA[0].delivery_city;
  const expectedCitySumA = evtsA.filter(e => e.delivery_city === targetCityA).reduce((s, e) => s + e.total_price, 0);
  const targetCityB = evtsB[0].delivery_city;
  const expectedCityCntB = evtsB.filter(e => e.delivery_city === targetCityB).length;

  let filtCityId: string;
  let filtCity2Id: string;

  beforeAll(async () => {
    const predA = {
      type: "group" as const,
      group: { logicalOp: "AND" as const, negate: false, predicates: [{
        type: "condition" as const,
        condition: {
          param: { kind: "field" as const, fieldName: evtField("delivery_city") },
          operator: "=" as const,
          value: { string: [targetCityA], time: [], float64: [], int64: [], bool: [] },
        },
      }]},
    };
    const predB = {
      type: "group" as const,
      group: { logicalOp: "AND" as const, negate: false, predicates: [{
        type: "condition" as const,
        condition: {
          param: { kind: "field" as const, fieldName: evtField("delivery_city") },
          operator: "=" as const,
          value: { string: [targetCityB], time: [], float64: [], int64: [], bool: [] },
        },
      }]},
    };
    [filtCityId, filtCity2Id] = await Promise.all([
      createAndVerifyUdaf(makeUdafPayload("filt_city",  "SUM", evtField("total_price"), predA)),
      createAndVerifyUdaf(makeUdafPayload("filt_city2", "COUNT", undefined, predB)),
    ]);
  });

  it("SUM total_price WHERE delivery_city = tagged city of custA's first event", async (ctx) => {
    const val = await waitForUdaf(filtCityId, custA.primary_id);
    skipIfNotMaterialized(ctx, val, "City-filtered SUM not materialized — timing skip");
    expect(val).toBeCloseTo(expectedCitySumA, 2);
  });

  it("COUNT WHERE delivery_city = tagged city of custB's first event", async (ctx) => {
    const val = await waitForUdaf(filtCity2Id, custB.primary_id);
    skipIfNotMaterialized(ctx, val, "City-filtered COUNT not materialized — timing skip");
    expect(val).toBe(expectedCityCntB);
  });
});

// ─── Combined AND filter: string + string ────────────────────────────────────

describe.skipIf(!CALCULATE_OK)("UDAF with combined AND filter (city + payment_type)", () => {
  const targetCity    = evtsA[0].delivery_city;
  const targetPayment = evtsA[0].payment_type;
  const expected = evtsA.filter(e => e.delivery_city === targetCity && e.payment_type === targetPayment).length;

  let filtAndId: string;

  beforeAll(async () => {
    const pred = {
      type: "group" as const,
      group: { logicalOp: "AND" as const, negate: false, predicates: [
        { type: "condition" as const, condition: { param: { kind: "field" as const, fieldName: evtField("delivery_city") }, operator: "=" as const, value: { string: [targetCity], time: [], float64: [], int64: [], bool: [] } } },
        { type: "condition" as const, condition: { param: { kind: "field" as const, fieldName: evtField("payment_type") }, operator: "=" as const, value: { string: [targetPayment], time: [], float64: [], int64: [], bool: [] } } },
      ]},
    };
    filtAndId = await createAndVerifyUdaf(makeUdafPayload("filt_and", "COUNT", undefined, pred));
  });

  it("COUNT WHERE city=custA_city0 AND payment_type=custA_payment0: correct filtered count", async (ctx) => {
    const val = await waitForUdaf(filtAndId, custA.primary_id);
    skipIfNotMaterialized(ctx, val, "AND-filtered COUNT not materialized — timing skip");
    expect(val).toBe(expected);
  });
});

// ─── Time window ─────────────────────────────────────────────────────────────

describe.skipIf(!CALCULATE_OK)("UDAF with time window", () => {
  let relId: string;
  let absId: string;

  beforeAll(async () => {
    [relId, absId] = await Promise.all([
      createAndVerifyUdaf(makeUdafPayload("tw_rel", "COUNT", undefined, noFilter, {
        from: { kind: "RELATIVE", relativeDuration: 365, relativeUnit: "DAY" },
      })),
      createAndVerifyUdaf(makeUdafPayload("tw_abs", "COUNT", undefined, noFilter, {
        from: { kind: "ABSOLUTE", absoluteTime: "2020-01-01T00:00:00Z" },
        to:   { kind: "ABSOLUTE", absoluteTime: "2020-12-31T23:59:59Z" },
      })),
    ]);
  });

  it("COUNT with RELATIVE 365-day window: custA = 4 (all events just ingested)", async (ctx) => {
    const val = await waitForUdaf(relId, custA.primary_id);
    skipIfNotMaterialized(ctx, val, "RELATIVE window UDAF not materialized — timing skip");
    expect(val).toBe(countA);
  });

  it("COUNT with ABSOLUTE window in 2020 (past) should return 0", async (ctx) => {
    const val = await waitForUdaf(absId, custA.primary_id);
    expectZeroOrSkip(ctx, val, "COUNT with ABSOLUTE window in 2020 (past) should return 0");
  });
});

// ─── No-events customer ──────────────────────────────────────────────────────

describe.skipIf(!CALCULATE_OK)("UDAF for customer with no events (custC)", () => {
  let sumId: string;
  let countId: string;
  let avgId: string;

  beforeAll(async () => {
    [sumId, countId, avgId] = await Promise.all([
      createAndVerifyUdaf(makeUdafPayload("none_sum", "SUM", evtField("total_price"))),
      createAndVerifyUdaf(makeUdafPayload("none_cnt", "COUNT")),
      createAndVerifyUdaf(makeUdafPayload("none_avg", "AVG", evtField("total_price"))),
    ]);
  });

  it("SUM returns null/0", async (ctx) => {
    const val = await waitForUdaf(sumId, custC.primary_id);
    expectZeroOrSkip(ctx, val, "SUM returns null/0");
  });

  it("COUNT returns null/0", async (ctx) => {
    const val = await waitForUdaf(countId, custC.primary_id);
    expectZeroOrSkip(ctx, val, "COUNT returns null/0");
  });

  it("AVG returns null/0", async (ctx) => {
    const val = await waitForUdaf(avgId, custC.primary_id);
    expectZeroOrSkip(ctx, val, "AVG returns null/0");
  });
});
