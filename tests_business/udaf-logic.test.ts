/**
 * Core UDAF logic tests — basic SUM/COUNT/AVG + time window + event filter.
 * Uses shared dataset from globalSetup (20 customers, deterministic events).
 * (Detailed per-field-type coverage is in udaf-field-types.test.ts)
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

// Designated customers with known event counts from shared dataset:
// customers[0] = 4 events, customers[2] = 2 events, customers[4] = 0 events
const custMany = customers[0];  // 4 events
const custFew  = customers[2];  // 2 events
const custNone = customers[4];  // 0 events

// Compute expected values from shared events array
const manyEvents = events.filter(e => e.primary_id === custMany.primary_id);
const fewEvents  = events.filter(e => e.primary_id === custFew.primary_id);
const expectedSumMany   = manyEvents.reduce((s, e) => s + e.total_price, 0);
const expectedSumFew    = fewEvents.reduce((s, e) => s + e.total_price, 0);
const expectedCountMany = manyEvents.length;
const expectedCountFew  = fewEvents.length;

const noFilter = { type: "group" as const, group: { logicalOp: "AND" as const, predicates: [], negate: false } };

// ─── SUM/COUNT sanity ─────────────────────────────────────────────────────────

describe.skipIf(!CALCULATE_OK)("UDAF: basic SUM/COUNT sanity", () => {
  let sumUdafId: string;
  let countUdafId: string;

  beforeAll(async () => {
    sumUdafId = await createAndVerifyUdaf({
      name: `${TAG}_core_sum`, aggType: "SUM",
      params: [{ fieldName: evtField("total_price") }],
      filter: { eventType: { id: purchaseTypeId(), name: "purchase" }, predicate: noFilter, timeWindow: {} },
    });
    countUdafId = await createAndVerifyUdaf({
      name: `${TAG}_core_cnt`, aggType: "COUNT", params: [],
      filter: { eventType: { id: purchaseTypeId(), name: "purchase" }, predicate: noFilter, timeWindow: {} },
    });
  });

  it("SUM total_price for custMany — correct sum from generated events", async (ctx) => {
    const val = await waitForUdaf(sumUdafId, custMany.primary_id);
    skipIfNotMaterialized(ctx, val, "SUM total_price");
    expect(val).toBeCloseTo(expectedSumMany, 2);
  });

  it("COUNT for custNone = 0 (no events)", async (ctx) => {
    const val = await waitForUdaf(countUdafId, custNone.primary_id);
    expectZeroOrSkip(ctx, val, "COUNT custNone");
  });

  it(`COUNT for custMany = ${expectedCountMany} (4 events)`, async (ctx) => {
    const val = await waitForUdaf(countUdafId, custMany.primary_id);
    skipIfNotMaterialized(ctx, val, "COUNT custMany");
    expect(val).toBe(expectedCountMany);
  });

  it(`COUNT for custFew = ${expectedCountFew} (2 events)`, async (ctx) => {
    const val = await waitForUdaf(countUdafId, custFew.primary_id);
    skipIfNotMaterialized(ctx, val, "COUNT custFew");
    expect(val).toBe(expectedCountFew);
  });
});

// ─── SUM with tagged city filter ──────────────────────────────────────────────

describe.skipIf(!CALCULATE_OK)("UDAF with event filter: city", () => {
  const targetCity = manyEvents[0].delivery_city;
  const cityEvts = manyEvents.filter(e => e.delivery_city === targetCity);
  const expectedCitySum = cityEvts.reduce((s, e) => s + e.total_price, 0);

  let cityUdafId: string;

  beforeAll(async () => {
    const pred = {
      type: "group" as const,
      group: { logicalOp: "AND" as const, negate: false, predicates: [
        { type: "condition" as const, condition: {
          param: { kind: "field" as const, fieldName: evtField("delivery_city") },
          operator: "=" as const,
          value: { string: [targetCity], time: [], float64: [], int64: [], bool: [] },
        }},
      ]},
    };
    cityUdafId = await createAndVerifyUdaf({
      name: `${TAG}_core_city`, aggType: "SUM",
      params: [{ fieldName: evtField("total_price") }],
      filter: { eventType: { id: purchaseTypeId(), name: "purchase" }, predicate: pred, timeWindow: {} },
    });
  });

  it("SUM total_price for custMany where city=tagged city of first event", async (ctx) => {
    const val = await waitForUdaf(cityUdafId, custMany.primary_id);
    skipIfNotMaterialized(ctx, val, "city-filtered SUM");
    expect(val).toBeCloseTo(expectedCitySum, 2);
  });
});

// ─── Time window ──────────────────────────────────────────────────────────────

describe.skipIf(!CALCULATE_OK)("UDAF with time window", () => {
  let relUdafId: string;
  let absUdafId: string;

  beforeAll(async () => {
    relUdafId = await createAndVerifyUdaf({
      name: `${TAG}_core_tw`, aggType: "COUNT", params: [],
      filter: { eventType: { id: purchaseTypeId(), name: "purchase" }, predicate: noFilter,
        timeWindow: { from: { kind: "RELATIVE", relativeDuration: 365, relativeUnit: "DAY" } } },
    });
    absUdafId = await createAndVerifyUdaf({
      name: `${TAG}_core_tw_abs`, aggType: "COUNT", params: [],
      filter: { eventType: { id: purchaseTypeId(), name: "purchase" }, predicate: noFilter,
        timeWindow: {
          from: { kind: "ABSOLUTE", absoluteTime: "2020-01-01T00:00:00Z" },
          to:   { kind: "ABSOLUTE", absoluteTime: "2020-12-31T23:59:59Z" },
        } },
    });
  });

  it("RELATIVE 365-day COUNT for custMany = 4 (events just ingested)", async (ctx) => {
    const val = await waitForUdaf(relUdafId, custMany.primary_id);
    skipIfNotMaterialized(ctx, val, "RELATIVE window COUNT");
    expect(val).toBe(expectedCountMany);
  });

  it("ABSOLUTE time window in the past (2020) should return 0 for custMany", async (ctx) => {
    const val = await waitForUdaf(absUdafId, custMany.primary_id);
    expectZeroOrSkip(ctx, val, "ABSOLUTE 2020 window"); // No events in 2020
  });
});

// ─── AVG ─────────────────────────────────────────────────────────────────────

describe.skipIf(!CALCULATE_OK)("UDAF: AVG total_price", () => {
  let avgUdafId: string;
  let sumNoneUdafId: string;
  let avgNoneUdafId: string;

  beforeAll(async () => {
    avgUdafId = await createAndVerifyUdaf({
      name: `${TAG}_core_avg`, aggType: "AVG",
      params: [{ fieldName: evtField("total_price") }],
      filter: { eventType: { id: purchaseTypeId(), name: "purchase" }, predicate: noFilter, timeWindow: {} },
    });
    sumNoneUdafId = await createAndVerifyUdaf({
      name: `${TAG}_none_sum`, aggType: "SUM",
      params: [{ fieldName: evtField("total_price") }],
      filter: { eventType: { id: purchaseTypeId(), name: "purchase" }, predicate: noFilter, timeWindow: {} },
    });
    avgNoneUdafId = await createAndVerifyUdaf({
      name: `${TAG}_none_avg`, aggType: "AVG",
      params: [{ fieldName: evtField("total_price") }],
      filter: { eventType: { id: purchaseTypeId(), name: "purchase" }, predicate: noFilter, timeWindow: {} },
    });
  });

  it("AVG for custMany = sum/4 (computed from generated events)", async (ctx) => {
    const val = await waitForUdaf(avgUdafId, custMany.primary_id);
    skipIfNotMaterialized(ctx, val, "AVG total_price");
    const expectedAvg = expectedSumMany / expectedCountMany;
    expect(val).toBeCloseTo(expectedAvg, 2);
  });

  it("SUM returns 0 for custNone (no events)", async (ctx) => {
    const val = await waitForUdaf(sumNoneUdafId, custNone.primary_id);
    expectZeroOrSkip(ctx, val, "SUM custNone");
  });

  it("AVG returns 0 for custNone (no events)", async (ctx) => {
    const val = await waitForUdaf(avgNoneUdafId, custNone.primary_id);
    expectZeroOrSkip(ctx, val, "AVG custNone");
  });
});
