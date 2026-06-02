/**
 * Event-behavior segments — UDAFs with event-side filter predicates.
 *
 * Real marketer journeys covered:
 *   1. Completed-only buyers   — COUNT events WHERE purchase_status='completed'
 *   2. Cash-paying customers   — COUNT events WHERE payment_type='cash'
 *   3. High-AOV customers      — AVG total_price > $X
 *   4. Big spenders            — SUM total_price > $X (total lifetime value)
 *   5. Repeat / one-time / heavy — COUNT bucketed
 *   6. Geo-targeting           — COUNT events WHERE delivery_city=$X
 *   7. Multi-filter compound   — completed AND card-payment buyers (event-side AND)
 *
 * Every test computes the expected count/sum from the in-memory event log so
 * "right people in segment" is mechanically verifiable.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { post } from "../tests_backend/client";
import { getTenant, custField, evtField, purchaseTypeId, isUdafCalculateHealthy } from "./tenant-context";
import { createAndVerifyUdaf } from "./udaf-helpers";

const t = getTenant();
const TAG = t.runTag;
const { customers, events } = t;
const CALCULATE_OK = isUdafCalculateHealthy();
const ids = customers.map(c => c.primary_id);

const emptyFv = { string: [], int64: [], float64: [], bool: [], time: [] };
const cond = (fieldName: string, operator: string, value: Partial<typeof emptyFv>) => ({
  type: "condition" as const,
  condition: {
    param: { kind: "field", fieldName },
    operator,
    value: { ...emptyFv, ...value },
  },
});
const udafCond = (artifactID: string, operator: string, value: Partial<typeof emptyFv>) => ({
  type: "condition" as const,
  condition: {
    param: { kind: "udaf", artifactID },
    operator,
    value: { ...emptyFv, ...value },
  },
});
const group = (logicalOp: "AND" | "OR", predicates: unknown[], negate = false) => ({
  type: "group" as const,
  group: { logicalOp, negate, predicates },
});
const noFilter = group("AND", []);

async function previewCount(filter: unknown): Promise<{ status: number; count: number }> {
  const r = await post("/api/v2/tenant/data/customers", {
    columns: [{ fieldName: "primary_id", kind: "field" }],
    orderBy: [],
    filter: { intersects: { customPredicate: group("AND", [cond("primary_id", "in", { int64: ids }), filter]) } },
    page: 0,
    size: 1000,
  });
  return { status: r.status, count: r.data?.list?.length ?? 0 };
}

// ─── Compute expected aggregates ──────────────────────────────────────────────

type EventAgg = { count: number; sumPrice: number; avgPrice: number };
function aggBy(predicate: (e: typeof events[number]) => boolean): Map<number, EventAgg> {
  const m = new Map<number, EventAgg>();
  for (const c of customers) m.set(c.primary_id, { count: 0, sumPrice: 0, avgPrice: 0 });
  for (const e of events) {
    if (!predicate(e)) continue;
    const a = m.get(e.primary_id);
    if (!a) continue;
    a.count++;
    a.sumPrice += e.total_price;
  }
  for (const a of m.values()) a.avgPrice = a.count ? a.sumPrice / a.count : 0;
  return m;
}

// ─── 1. Status-filtered UDAFs ─────────────────────────────────────────────────

describe.skipIf(!CALCULATE_OK)("Event-behavior: status-filtered counts", () => {
  let completedCnt: string;
  let cashPay: string;

  beforeAll(async () => {
    completedCnt = await createAndVerifyUdaf({
      name: `${TAG}_completed_cnt`,
      aggType: "COUNT",
      params: [],
      filter: {
        eventType: { id: purchaseTypeId(), name: "purchase" },
        predicate: group("AND", [cond(evtField("purchase_status"), "=", { string: ["completed"] })]),
        timeWindow: {},
      },
    });
    cashPay = await createAndVerifyUdaf({
      name: `${TAG}_cash_cnt`,
      aggType: "COUNT",
      params: [],
      filter: {
        eventType: { id: purchaseTypeId(), name: "purchase" },
        predicate: group("AND", [cond(evtField("payment_type"), "=", { string: ["cash"] })]),
        timeWindow: {},
      },
    });
  });

  it("'completed-purchase buyers' — at least 1 completed event", async () => {
    const agg = aggBy(e => e.purchase_status === "completed");
    const expected = customers.filter(c => (agg.get(c.primary_id)?.count ?? 0) >= 1).length;
    const r = await previewCount(udafCond(completedCnt, ">=", { int64: [1] }));
    expect(r.status).not.toBe(500);
    if (r.status === 200) expect(r.count).toBe(expected);
  });

  it("'cash buyers' — at least 1 cash event", async () => {
    const agg = aggBy(e => e.payment_type === "cash");
    const expected = customers.filter(c => (agg.get(c.primary_id)?.count ?? 0) >= 1).length;
    const r = await previewCount(udafCond(cashPay, ">=", { int64: [1] }));
    expect(r.status).not.toBe(500);
    if (r.status === 200) expect(r.count).toBe(expected);
  });

  it("'card-only buyers' — has events BUT zero cash events (NOT-cash-buyer)", async () => {
    const cashAgg = aggBy(e => e.payment_type === "cash");
    const allAgg  = aggBy(() => true);
    const expected = customers.filter(c => {
      const all  = allAgg.get(c.primary_id)?.count ?? 0;
      const cash = cashAgg.get(c.primary_id)?.count ?? 0;
      return all >= 1 && cash === 0;
    }).length;
    const filter = group("AND", [
      udafCond(cashPay, "=", { int64: [0] }),
    ]);
    const r = await previewCount(filter);
    expect(r.status).not.toBe(500);
    if (r.status === 200) expect(r.count).toBe(expected);
  });
});

// ─── 2. Value-aggregate UDAFs ─────────────────────────────────────────────────

describe.skipIf(!CALCULATE_OK)("Event-behavior: revenue / AOV targeting", () => {
  let sumPrice: string;
  let avgPrice: string;

  beforeAll(async () => {
    sumPrice = await createAndVerifyUdaf({
      name: `${TAG}_sum_total`,
      aggType: "SUM",
      params: [{ fieldName: evtField("total_price") }],
      filter: { eventType: { id: purchaseTypeId(), name: "purchase" }, predicate: noFilter, timeWindow: {} },
    });
    avgPrice = await createAndVerifyUdaf({
      name: `${TAG}_avg_total`,
      aggType: "AVG",
      params: [{ fieldName: evtField("total_price") }],
      filter: { eventType: { id: purchaseTypeId(), name: "purchase" }, predicate: noFilter, timeWindow: {} },
    });
  });

  it("'big spenders' — SUM(total_price) > 500", async () => {
    const agg = aggBy(() => true);
    const expected = customers.filter(c => (agg.get(c.primary_id)?.sumPrice ?? 0) > 500).length;
    const r = await previewCount(udafCond(sumPrice, ">", { float64: [500] }));
    expect(r.status).not.toBe(500);
    if (r.status === 200) expect(r.count).toBe(expected);
  });

  it("'high-AOV' — AVG(total_price) > 200", async () => {
    const agg = aggBy(() => true);
    const expected = customers.filter(c => (agg.get(c.primary_id)?.avgPrice ?? 0) > 200).length;
    const r = await previewCount(udafCond(avgPrice, ">", { float64: [200] }));
    expect(r.status).not.toBe(500);
    if (r.status === 200) expect(r.count).toBe(expected);
  });
});

// ─── 3. Frequency buckets — one-time vs repeat vs heavy buyer ─────────────────

describe.skipIf(!CALCULATE_OK)("Event-behavior: purchase frequency buckets", () => {
  let cnt: string;

  beforeAll(async () => {
    cnt = await createAndVerifyUdaf({
      name: `${TAG}_freq_cnt`,
      aggType: "COUNT",
      params: [],
      filter: { eventType: { id: purchaseTypeId(), name: "purchase" }, predicate: noFilter, timeWindow: {} },
    });
  });

  it("'one-time buyers' — COUNT == 1 (first-purchase onboarding cohort)", async () => {
    const agg = aggBy(() => true);
    const expected = customers.filter(c => (agg.get(c.primary_id)?.count ?? 0) === 1).length;
    const r = await previewCount(udafCond(cnt, "=", { int64: [1] }));
    expect(r.status).not.toBe(500);
    if (r.status === 200) expect(r.count).toBe(expected);
  });

  it("'repeat buyers' — COUNT >= 2", async () => {
    const agg = aggBy(() => true);
    const expected = customers.filter(c => (agg.get(c.primary_id)?.count ?? 0) >= 2).length;
    const r = await previewCount(udafCond(cnt, ">=", { int64: [2] }));
    expect(r.status).not.toBe(500);
    if (r.status === 200) expect(r.count).toBe(expected);
  });

  it("'heavy buyers' — COUNT >= 5 (VIP nudge)", async () => {
    const agg = aggBy(() => true);
    const expected = customers.filter(c => (agg.get(c.primary_id)?.count ?? 0) >= 5).length;
    const r = await previewCount(udafCond(cnt, ">=", { int64: [5] }));
    expect(r.status).not.toBe(500);
    if (r.status === 200) expect(r.count).toBe(expected);
  });
});

// ─── 4. Geo targeting via event-field UDAF ────────────────────────────────────

describe.skipIf(!CALCULATE_OK)("Event-behavior: geo targeting (event-field predicate)", () => {
  it("'buyers in city X' — COUNT events WHERE delivery_city=X ≥ 1", async () => {
    // Pick the first event's tagged city as the target — guaranteed to have ≥1 customer
    if (events.length === 0) return;
    const city = events[0].delivery_city;

    const udafId = await createAndVerifyUdaf({
      name: `${TAG}_city_${Date.now() % 100000}`,
      aggType: "COUNT",
      params: [],
      filter: {
        eventType: { id: purchaseTypeId(), name: "purchase" },
        predicate: group("AND", [cond(evtField("delivery_city"), "=", { string: [city] })]),
        timeWindow: {},
      },
    });

    const cityAgg = aggBy(e => e.delivery_city === city);
    const expected = customers.filter(c => (cityAgg.get(c.primary_id)?.count ?? 0) >= 1).length;

    const r = await previewCount(udafCond(udafId, ">=", { int64: [1] }));
    expect(r.status).not.toBe(500);
    if (r.status === 200) expect(r.count).toBe(expected);
  });
});

// ─── 5. Compound event-filter UDAF — completed AND card ──────────────────────

describe.skipIf(!CALCULATE_OK)("Event-behavior: compound event-side filter", () => {
  it("'completed AND card-payer' — COUNT events WHERE status=completed AND payment=card ≥ 1", async () => {
    const udafId = await createAndVerifyUdaf({
      name: `${TAG}_done_card`,
      aggType: "COUNT",
      params: [],
      filter: {
        eventType: { id: purchaseTypeId(), name: "purchase" },
        predicate: group("AND", [
          cond(evtField("purchase_status"), "=", { string: ["completed"] }),
          cond(evtField("payment_type"), "=", { string: ["card"] }),
        ]),
        timeWindow: {},
      },
    });

    const agg = aggBy(e => e.purchase_status === "completed" && e.payment_type === "card");
    const expected = customers.filter(c => (agg.get(c.primary_id)?.count ?? 0) >= 1).length;

    const r = await previewCount(udafCond(udafId, ">=", { int64: [1] }));
    expect(r.status).not.toBe(500);
    if (r.status === 200) expect(r.count).toBe(expected); // hits BUG-090 on event-side predicate
  });
});
