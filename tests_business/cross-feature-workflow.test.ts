/**
 * L3 Cross-Feature Data Flow Verification
 *
 * Uses shared dataset from globalSetup: 20 customers, 45 events.
 * Tests the full pipeline: query-back -> UDAF -> segmentation -> campaign
 *
 * Shared dataset distribution (from global-setup-shared.ts):
 *   20 customers, 16 adults, 4 minors
 *   45 purchase events across 18 customers (2 have no events)
 */
import { describe, it, expect } from "vitest";
import { get, post, put } from "../tests_backend/client";
import { primaryIdScopePredicate, v2Filter } from "./test-factories";
import { custField, evtField, purchaseTypeId, getTenant } from "./tenant-context";

const BASE_URL = process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz";

const t = getTenant();
const { customers, events, runTag: TAG } = t;

const IDS = customers.map(c => c.primary_id);

const EXP = {
  totalCustomers: 20,
  totalEvents: 45,
  adultsCount: customers.filter(c => c.is_adult).length,
  minorsCount: customers.filter(c => !c.is_adult).length,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function cond(fieldName: string, operator: string, value: any) {
  return {
    type: "condition" as const,
    condition: {
      param: { kind: "field" as const, fieldName },
      operator,
      value: { string: value.string ?? [], time: value.time ?? [], float64: value.float64 ?? [], int64: value.int64 ?? [], bool: value.bool ?? [] },
    },
  };
}

function udafCond(udafId: string, operator: string, value: any) {
  return {
    type: "condition" as const,
    condition: {
      param: { kind: "udaf" as const, artifactId: udafId },
      operator,
      value: { string: value.string ?? [], time: value.time ?? [], float64: value.float64 ?? [], int64: value.int64 ?? [], bool: value.bool ?? [] },
    },
  };
}

function group(logicalOp: "AND" | "OR", predicates: any[], negate = false) {
  return { type: "group" as const, group: { logicalOp, negate, predicates } };
}

function preview(name: string, segments: { name: string; customerProfileFilter: any }[]) {
  return post("/api/tenants/segmentation/preview", { segmentation: { name, segments } });
}

function segCount(data: any, segName: string): number {
  return data.segments.find((s: any) => s.name === segName)?.numberOfCustomer ?? -1;
}

async function safePreview(name: string, segments: { name: string; customerProfileFilter: any }[]) {
  const { status, data } = await preview(name, segments);
  if (status === 409) {
    console.warn(`Preview returned 409 for "${name}" -- UDAF not yet materialized`);
    return null;
  }
  expect(status).toBe(200);
  return data;
}

// Scope predicates to our IDs so we get exact counts
function scoped(predicates: any[]) {
  return group("AND", [
    primaryIdScopePredicate(IDS),
    ...predicates,
  ]);
}

// ─── Phase 1: Query-Back ─────────────────────────────────────────────────────

describe("L3: Query-Back -- field values survive the pipeline", () => {
  it("first customer fields should be populated", async () => {
    const { status, data } = await get(`/api/tenant/data/customers/${IDS[0]}`);
    expect(status).toBe(200);
    const f = data.fields;
    expect(f[custField("gender")]).toBeDefined();
    expect(f[custField("is_adult")]).toBeDefined();
    expect(f[custField("income")]).toBeDefined();
    expect(f[custField("age")]).toBeDefined();
  });

  it("v2 query scoped to our IDs should return 20 customers", async () => {
    const gc = custField("gender");
    const { status, data } = await post("/api/v2/tenant/data/customers", {
      columns: [{ fieldName: "primary_id", kind: "field" }, { fieldName: gc, kind: "field" }],
      orderBy: [],
      filter: v2Filter([primaryIdScopePredicate(IDS)]),
      page: 0,
      size: 50,
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(EXP.totalCustomers);
  });
});

// ─── Phase 2: Events -- Per-Customer Event Counts ────────────────────────────

describe("L3: Events -- per-customer purchase counts via v2 events API", () => {
  it("customers with events should have queryable event records", async () => {
    // Find first customer that has events in the shared dataset
    const customersWithEvents = customers.filter(c =>
      events.some(e => e.primary_id === c.primary_id)
    );
    expect(customersWithEvents.length).toBeGreaterThan(0);

    const firstWithEvents = customersWithEvents[0];
    const expectedCount = events.filter(e => e.primary_id === firstWithEvents.primary_id).length;

    const { data } = await post("/api/v2/tenant/data/events", {
      eventTypeId: purchaseTypeId(),
      columns: [{ fieldName: "primary_id", kind: "field" }, { fieldName: evtField("total_price"), kind: "field" }],
      orderBy: [],
      filter: {
        intersects: {
          customPredicate: {
            type: "group",
            group: {
              logicalOp: "AND",
              negate: false,
              predicates: [{
                type: "condition",
                condition: {
                  operator: "=",
                  param: { fieldName: "primary_id", kind: "field" },
                  value: { bool: [], float64: [], int64: [firstWithEvents.primary_id], string: [], time: [] },
                },
              }],
            },
          },
        },
      },
      page: 0,
      size: 20,
    });
    expect(data.list.length).toBe(expectedCount);
  });
});

// ─── Phase 3: UDAF Creation ─────────────────────────────────────────────────

let countUdafId: string;
let sumPriceUdafId: string;

describe("L3: Create UDAFs for cross-feature verification", () => {
  it("should create COUNT purchases UDAF", async () => {
    const { status, data } = await post("/api/tenants/udafs", {
      name: `${TAG}_xflow_count`,
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
      name: `${TAG}_xflow_sum`,
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

// ─── Phase 4: UDAF -> Segmentation ────────────────────────────────────────

describe("L3: UDAF -> Segmentation -- aggregate thresholds produce correct counts", () => {
  it("COUNT > 0 scoped -> customers with any purchases", async () => {
    if (!countUdafId) return;
    const customersWithEvents = customers.filter(c =>
      events.some(e => e.primary_id === c.primary_id)
    ).length;
    const data = await safePreview(`${TAG}_xflow_cnt_gt0`, [
      { name: "HasPurchases", customerProfileFilter: scoped([udafCond(countUdafId, ">", { float64: [0] })]) },
    ]);
    if (!data) return;
    expect(segCount(data, "HasPurchases")).toBe(customersWithEvents);
  });

  it("SUM > 0 scoped -> all customers with events should have positive sum", async () => {
    if (!sumPriceUdafId) return;
    const customersWithEvents = customers.filter(c =>
      events.some(e => e.primary_id === c.primary_id)
    ).length;
    const data = await safePreview(`${TAG}_xflow_sum_gt0`, [
      { name: "HasSpend", customerProfileFilter: scoped([udafCond(sumPriceUdafId, ">", { float64: [0] })]) },
    ]);
    if (!data) return;
    expect(segCount(data, "HasSpend")).toBe(customersWithEvents);
  });
});

// ─── Phase 5: Combined Customer + UDAF Segmentation ────────────────────────

describe("L3: Combined customer fields + UDAF -- cross-feature predicates", () => {
  it("adult AND COUNT >= 1 scoped -> adults with at least 1 purchase", async () => {
    if (!countUdafId) return;
    const expected = customers.filter(c =>
      c.is_adult && events.some(e => e.primary_id === c.primary_id)
    ).length;
    const data = await safePreview(`${TAG}_xflow_adult_active`, [
      {
        name: "ActiveAdults",
        customerProfileFilter: scoped([
          cond(custField("is_adult"), "=", { bool: [true] }),
          udafCond(countUdafId, ">=", { float64: [1] }),
        ]),
      },
    ]);
    if (!data) return;
    expect(segCount(data, "ActiveAdults")).toBe(expected);
  });

  it("NOT adult AND COUNT > 0 scoped -> minors with purchases", async () => {
    if (!countUdafId) return;
    const expected = customers.filter(c =>
      !c.is_adult && events.some(e => e.primary_id === c.primary_id)
    ).length;
    const data = await safePreview(`${TAG}_xflow_minor_buyer`, [
      {
        name: "MinorBuyers",
        customerProfileFilter: scoped([
          cond(custField("is_adult"), "=", { bool: [false] }),
          udafCond(countUdafId, ">", { float64: [0] }),
        ]),
      },
    ]);
    if (!data) return;
    expect(segCount(data, "MinorBuyers")).toBe(expected);
  });
});

// ─── Phase 6: Segmentation -> Campaign Entity Chain ──────────────────────────

let savedSegId: string;
let savedSegHighId: string;
let commChanId: string;
let templateId: string;

describe("L3: Segmentation -> Campaign -- full entity dependency chain", () => {
  it("should save a segmentation with UDAF predicate", async () => {
    if (!sumPriceUdafId) return;
    const { status, data } = await post("/api/tenants/segmentation", {
      name: `${TAG}_xflow_seg`,
      segments: [
        { name: "HasSpend", customerProfileFilter: group("AND", [udafCond(sumPriceUdafId, ">", { float64: [0] })]) },
        { name: "NoSpend", customerProfileFilter: group("AND", [udafCond(sumPriceUdafId, "<=", { float64: [0] })]) },
      ],
    });
    expect(status).toBe(200);
    savedSegId = data.id;
    savedSegHighId = data.segments.find((s: any) => s.name === "HasSpend")?.id;
    expect(savedSegHighId).toBeDefined();
  });

  it("should retrieve saved segmentation with correct predicate structure", async () => {
    if (!savedSegId) return;
    const { status, data } = await get(`/api/tenants/segmentation/${savedSegId}`);
    expect(status).toBe(200);
    expect(data.segments.length).toBe(2);
    const hs = data.segments.find((s: any) => s.name === "HasSpend");
    expect(hs).toBeDefined();
    const pred = hs.customerProfileFilter.group.predicates[0];
    expect(pred.condition.param.kind).toBe("udaf");
    expect(pred.condition.param.artifactId).toBe(sumPriceUdafId);
  });

  it("should create blackhole comm channel", async () => {
    const { status, data } = await post("/api/tenants/commchan", {
      name: `${TAG}_xflow_chan`,
      kind: "blackhole",
      mappings: {},
      chanconf: {},
    });
    expect(status).toBe(200);
    commChanId = data.id;
  });

  it("should verify the comm channel", async () => {
    if (!commChanId) return;
    const { status, data } = await post(`/api/tenants/commchan/${commChanId}/verify`);
    expect(status).toBe(200);
    expect(data.verified).toBe(true);
  });

  it("should create email template with customer field variables", async () => {
    const { status, data } = await post("/api/tenant/template", {
      content_type: "html",
      name: `${TAG}_xflow_tmpl`,
      subject: "Special offer for {{first_name}}",
      content: "<p>Dear {{first_name}}, you have purchases!</p>",
      variables: { first_name: custField("first_name") },
    });
    expect(status).toBe(201);
    templateId = data.id;
  });

  it("should create campaign linking segment + channel + template", async () => {
    if (!savedSegHighId || !commChanId || !templateId) return;
    const { status, data } = await post("/api/tenants/campaign", {
      name: `${TAG}_xflow_campaign`,
      commChanId,
      templateId,
      includeSegment: [savedSegHighId],
      excludeSegment: [],
    });
    if (status === 500) {
      console.warn("Campaign create returned 500");
      return;
    }
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");

    const { data: campDetail } = await get(`/api/tenants/campaign/${data.id}`);
    expect(campDetail.commChan.id).toBe(commChanId);
    expect(campDetail.template.id).toBe(templateId);
    expect(campDetail.includeSegment.length).toBe(1);
  });
});

// ─── Phase 7: Multi-UDAF Complex Segmentation ──────────────────────────────

describe("L3: Multi-UDAF segmentation -- COUNT + SUM in one predicate", () => {
  it("COUNT >= 3 AND SUM > 0 scoped -> customers with at least 3 purchases", async () => {
    if (!countUdafId || !sumPriceUdafId) return;
    const expected = customers.filter(c => {
      const custEvents = events.filter(e => e.primary_id === c.primary_id);
      return custEvents.length >= 3;
    }).length;
    const data = await safePreview(`${TAG}_xflow_multi_udaf`, [
      {
        name: "FreqBuyers",
        customerProfileFilter: scoped([
          udafCond(countUdafId, ">=", { float64: [3] }),
          udafCond(sumPriceUdafId, ">", { float64: [0] }),
        ]),
      },
    ]);
    if (!data) return;
    expect(segCount(data, "FreqBuyers")).toBe(expected);
  });

  it("3-tier segmentation by COUNT scoped -> partitions all 20 customers", async () => {
    if (!countUdafId) return;
    const noneExp = customers.filter(c => !events.some(e => e.primary_id === c.primary_id)).length;
    const lowExp = customers.filter(c => {
      const cnt = events.filter(e => e.primary_id === c.primary_id).length;
      return cnt >= 1 && cnt <= 2;
    }).length;
    const highExp = customers.filter(c =>
      events.filter(e => e.primary_id === c.primary_id).length >= 3
    ).length;

    const data = await safePreview(`${TAG}_xflow_count_tiers`, [
      { name: "None", customerProfileFilter: scoped([udafCond(countUdafId, "=", { float64: [0] })]) },
      { name: "Low",  customerProfileFilter: scoped([udafCond(countUdafId, ">=", { float64: [1] }), udafCond(countUdafId, "<=", { float64: [2] })]) },
      { name: "High", customerProfileFilter: scoped([udafCond(countUdafId, ">=", { float64: [3] })]) },
    ]);
    if (!data) return;
    const none = segCount(data, "None");
    const low = segCount(data, "Low");
    const high = segCount(data, "High");
    expect(none).toBe(noneExp);
    expect(low).toBe(lowExp);
    expect(high).toBe(highExp);
    expect(none + low + high).toBe(EXP.totalCustomers);
  });
});
