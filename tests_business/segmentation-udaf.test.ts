/**
 * Segmentation with UDAF-based predicates.
 * Uses shared dataset from globalSetup scoped by primary_id IN [...].
 *
 * NOTE: UDAF compute is broken on shared tenant — UDAF-predicate segmentation
 * will return code-13 errors or 0 counts. Tests that use UDAF predicates are
 * kept as bug-documenting assertions: they expect correct behavior (200 + right count)
 * but will fail until the backend is fixed. Non-UDAF tests should pass.
 */
import { describe, it, expect } from "vitest";
import { post, get } from "../tests_backend/client";
import { custField, evtField, purchaseTypeId, getTenant } from "./tenant-context";
import { primaryIdScopePredicate } from "./test-factories";

const t = getTenant();
const { customers, events, runTag: tag } = t;

// ─── Derived maps from shared dataset ───────────────────────────────────────

const ourIds = customers.map(c => c.primary_id);

/** Event counts per customer (keyed by primary_id) */
const eventCountMap = new Map<number, number>();
/** Sum of total_price per customer */
const totalPriceMap = new Map<number, number>();

for (const c of customers) {
  eventCountMap.set(c.primary_id, 0);
  totalPriceMap.set(c.primary_id, 0);
}
for (const e of events) {
  eventCountMap.set(e.primary_id, (eventCountMap.get(e.primary_id) || 0) + 1);
  totalPriceMap.set(e.primary_id, (totalPriceMap.get(e.primary_id) || 0) + e.total_price);
}

function cond(fieldName: string, operator: string, value: any) {
  return {
    type: "condition" as const,
    condition: {
      param: { kind: "field" as const, fieldName },
      operator,
      value: {
        string: value.string ?? [], time: value.time ?? [],
        float64: value.float64 ?? [], int64: value.int64 ?? [],
        bool: value.bool ?? [],
      },
    },
  };
}

function udafCond(udafId: string, operator: string, value: any) {
  return {
    type: "condition" as const,
    condition: {
      param: { kind: "udaf" as const, artifactId: udafId },
      operator,
      value: {
        string: value.string ?? [], time: value.time ?? [],
        float64: value.float64 ?? [], int64: value.int64 ?? [],
        bool: value.bool ?? [],
      },
    },
  };
}

function group(logicalOp: "AND" | "OR", predicates: any[], negate = false) {
  return { type: "group" as const, group: { logicalOp, negate, predicates } };
}

function scoped(filter: any): any {
  return group("AND", [primaryIdScopePredicate(ourIds), filter]);
}

function preview(name: string, segments: { name: string; customerProfileFilter: any }[]) {
  return post("/api/tenants/segmentation/preview", { segmentation: { name, segments } });
}

function segCount(data: any, segName: string): number {
  return data.segments.find((s: any) => s.name === segName)?.numberOfCustomer ?? -1;
}

function matchCount(pred: (c: typeof customers[0]) => boolean): number {
  return customers.filter(pred).length;
}

// ─── Setup: create UDAFs for use in segmentation predicates ─────────────────

let countUdafId: string;
let sumPriceUdafId: string;

describe("Setup: create UDAFs for segmentation", () => {
  it("should create COUNT purchases UDAF", async () => {
    const { status, data } = await post("/api/tenants/udafs", {
      name: `${tag}_seg_count`,
      aggType: "COUNT",
      params: [],
      filter: {
        eventType: { id: purchaseTypeId(), name: "purchase" },
        predicate: { type: "group", group: { logicalOp: "AND", predicates: [], negate: false } },
        timeWindow: {},
      },
      grouping: { enable: false },
    });
    expect(status).toBe(200);
    countUdafId = data.id;
  });

  it("should create SUM total_price UDAF", async () => {
    const { status, data } = await post("/api/tenants/udafs", {
      name: `${tag}_seg_sum_price`,
      aggType: "SUM",
      params: [{ fieldName: evtField("total_price") }],
      filter: {
        eventType: { id: purchaseTypeId(), name: "purchase" },
        predicate: { type: "group", group: { logicalOp: "AND", predicates: [], negate: false } },
        timeWindow: {},
      },
      grouping: { enable: false },
    });
    expect(status).toBe(200);
    sumPriceUdafId = data.id;
  });
});

// ─── Segmentation: UDAF in predicates ───────────────────────────────────────
// NOTE: These tests document expected correct behavior. On shared tenant with
// broken compute, UDAF predicates return code-13 or 0. If tests fail, that's
// a known bug, not a test problem.

describe("Segmentation: UDAF-based predicates (bug-documenting)", () => {
  it("COUNT purchases > 0 should match customers with events", async () => {
    if (!countUdafId) return;
    const expected = matchCount(c => (eventCountMap.get(c.primary_id) || 0) > 0);

    const { status, data } = await preview(`${tag}_udaf_count_gt0`, [
      { name: "HasPurchases", customerProfileFilter: scoped(group("AND", [udafCond(countUdafId, ">", { float64: [0] })])) },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "HasPurchases")).toBe(expected);
  });

  it("COUNT purchases = 0 should match customers without events", async () => {
    if (!countUdafId) return;
    const expected = matchCount(c => (eventCountMap.get(c.primary_id) || 0) === 0);

    const { status, data } = await preview(`${tag}_udaf_count_eq0`, [
      { name: "NoPurchases", customerProfileFilter: scoped(group("AND", [udafCond(countUdafId, "=", { float64: [0] })])) },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "NoPurchases")).toBe(expected);
  });

  it("COUNT purchases >= 3 should match high-activity customers", async () => {
    if (!countUdafId) return;
    const expected = matchCount(c => (eventCountMap.get(c.primary_id) || 0) >= 3);

    const { status, data } = await preview(`${tag}_udaf_count_gte3`, [
      { name: "Active", customerProfileFilter: scoped(group("AND", [udafCond(countUdafId, ">=", { float64: [3] })])) },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "Active")).toBe(expected);
  });

  it("SUM total_price > 1000 should match big spenders", async () => {
    if (!sumPriceUdafId) return;
    const expected = matchCount(c => (totalPriceMap.get(c.primary_id) || 0) > 1000);

    const { status, data } = await preview(`${tag}_udaf_sum_gt1000`, [
      { name: "BigSpend", customerProfileFilter: scoped(group("AND", [udafCond(sumPriceUdafId, ">", { float64: [1000] })])) },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "BigSpend")).toBe(expected);
  });
});

// ─── Combined: customer field + UDAF condition ──────────────────────────────

describe("Segmentation: combined customer + UDAF predicates (bug-documenting)", () => {
  it("female AND COUNT purchases > 0 should match females with purchases", async () => {
    if (!countUdafId) return;
    const expected = matchCount(c =>
      c.gender === "female" && (eventCountMap.get(c.primary_id) || 0) > 0
    );

    const { status, data } = await preview(`${tag}_fem_active`, [
      {
        name: "FemActive",
        customerProfileFilter: scoped(group("AND", [
          cond(custField("gender"), "=", { string: ["female"] }),
          udafCond(countUdafId, ">", { float64: [0] }),
        ])),
      },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "FemActive")).toBe(expected);
  });

  it("adult AND SUM total_price > 500 should match adult big spenders", async () => {
    if (!sumPriceUdafId) return;
    const expected = matchCount(c =>
      c.is_adult && (totalPriceMap.get(c.primary_id) || 0) > 500
    );

    const { status, data } = await preview(`${tag}_adult_bigspend`, [
      {
        name: "AdultBigSpend",
        customerProfileFilter: scoped(group("AND", [
          cond(custField("is_adult"), "=", { bool: [true] }),
          udafCond(sumPriceUdafId, ">", { float64: [500] }),
        ])),
      },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "AdultBigSpend")).toBe(expected);
  });

  it("multi-segment: Active vs Inactive vs Big vs Small spenders", async () => {
    if (!countUdafId || !sumPriceUdafId) return;
    const noActivityExp = matchCount(c => (eventCountMap.get(c.primary_id) || 0) === 0);
    const lowSpendExp = matchCount(c => {
      const tp = totalPriceMap.get(c.primary_id) || 0;
      return tp > 0 && tp <= 500;
    });
    const highSpendExp = matchCount(c => (totalPriceMap.get(c.primary_id) || 0) > 500);

    const { status, data } = await preview(`${tag}_multi_udaf`, [
      { name: "NoActivity", customerProfileFilter: scoped(group("AND", [udafCond(countUdafId, "=", { float64: [0] })])) },
      { name: "LowSpend", customerProfileFilter: scoped(group("AND", [udafCond(sumPriceUdafId, ">", { float64: [0] }), udafCond(sumPriceUdafId, "<=", { float64: [500] })])) },
      { name: "HighSpend", customerProfileFilter: scoped(group("AND", [udafCond(sumPriceUdafId, ">", { float64: [500] })])) },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "NoActivity")).toBe(noActivityExp);
    expect(segCount(data, "LowSpend")).toBe(lowSpendExp);
    expect(segCount(data, "HighSpend")).toBe(highSpendExp);
  });
});

// ─── Segmentation: OR with UDAF ─────────────────────────────────────────────

describe("Segmentation: OR conditions with UDAF (bug-documenting)", () => {
  it("female OR COUNT > 3 → females + high-activity customers", async () => {
    if (!countUdafId) return;
    const expected = matchCount(c =>
      c.gender === "female" || (eventCountMap.get(c.primary_id) || 0) > 3
    );

    const { status, data } = await preview(`${tag}_or_udaf`, [
      {
        name: "FemOrHighAct",
        customerProfileFilter: scoped(group("OR", [
          cond(custField("gender"), "=", { string: ["female"] }),
          udafCond(countUdafId, ">", { float64: [3] }),
        ])),
      },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "FemOrHighAct")).toBe(expected);
  });
});

// ─── Non-UDAF sanity test — should always pass ──────────────────────────────

describe("Segmentation: non-UDAF scoped sanity check", () => {
  it("all our customers via primary_id scope", async () => {
    const { status, data } = await preview(`${tag}_sanity`, [
      { name: "All", customerProfileFilter: group("AND", [primaryIdScopePredicate(ourIds)]) },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "All")).toBe(customers.length);
  });

  it("female customers from our set", async () => {
    const expected = matchCount(c => c.gender === "female");
    const { status, data } = await preview(`${tag}_fem_sanity`, [
      { name: "Fem", customerProfileFilter: scoped(group("AND", [cond(custField("gender"), "=", { string: ["female"] })])) },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "Fem")).toBe(expected);
  });
});
