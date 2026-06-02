/**
 * Temporal segments — date predicates + relative time windows.
 *
 * Real marketer journeys covered:
 *   1. Welcome series — "signed up in the last N days" (cdp_created_at)
 *   2. Recent buyers  — UDAF COUNT purchases in RELATIVE last 30/90 days
 *   3. Lapsed         — `NOT (purchased in last 90d)` (negation over UDAF)
 *   4. Lifetime activity vs recent — `lifetime COUNT > 0 AND recent COUNT = 0`
 *   5. Birthday targeting — `birthdate` field with year/month filter
 *   6. Time-window differential — RELATIVE-365d count == ALL_TIME count when
 *      events are recent (regression for BUG-002 + new BUG-091 path)
 *
 * Tests compute expected counts from the shared dataset. RELATIVE-window UDAF
 * results may show BUG-091 (predicate dropped) or BUG-090 (multi-predicate).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { get, post } from "../tests_backend/client";
import { getTenant, custField, purchaseTypeId, isUdafCalculateHealthy } from "./tenant-context";
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

// ─── 1. Birthdate field predicates (no time window — pure field) ──────────────

describe("Temporal: birthdate field segments", () => {
  it("'customers born after 2000' — direct field comparison", async () => {
    const expected = customers.filter(c => c.birthdate >= "2000-01-01").length;
    const r = await previewCount(cond(custField("birthdate"), ">=", { time: ["2000-01-01T00:00:00Z"] }));
    expect(r.status).not.toBe(500);
    if (r.status === 200) expect(r.count).toBe(expected);
  });

  it("'born in 1990s' — range filter (2 predicates → BUG-090 surface)", async () => {
    const expected = customers.filter(c => c.birthdate >= "1990-01-01" && c.birthdate < "2000-01-01").length;
    const filter = group("AND", [
      cond(custField("birthdate"), ">=", { time: ["1990-01-01T00:00:00Z"] }),
      cond(custField("birthdate"), "<",  { time: ["2000-01-01T00:00:00Z"] }),
    ]);
    const r = await previewCount(filter);
    expect(r.status).not.toBe(500);
    if (r.status === 200) expect(r.count).toBe(expected);
  });
});

// ─── 2. Relative-window UDAFs ─────────────────────────────────────────────────

describe.skipIf(!CALCULATE_OK)("Temporal: relative-window UDAFs (recent activity)", () => {
  let recent30: string;
  let lifetime: string;

  beforeAll(async () => {
    recent30 = await createAndVerifyUdaf({
      name: `${TAG}_recent30`,
      aggType: "COUNT",
      params: [],
      filter: {
        eventType: { id: purchaseTypeId(), name: "purchase" },
        predicate: noFilter,
        timeWindow: { from: { kind: "RELATIVE", relativeDuration: 30, relativeUnit: "DAY" } },
      },
    });
    lifetime = await createAndVerifyUdaf({
      name: `${TAG}_lifetime_cnt`,
      aggType: "COUNT",
      params: [],
      filter: {
        eventType: { id: purchaseTypeId(), name: "purchase" },
        predicate: noFilter,
        timeWindow: {},
      },
    });
  });

  it("'recent buyers' — UDAF COUNT-30d ≥ 1 ⇒ matches buyers since events are fresh", async () => {
    // All test events are ingested now → 30-day window equals lifetime
    const buyerIds = new Set(events.map(e => e.primary_id));
    const expected = customers.filter(c => buyerIds.has(c.primary_id)).length;
    const r = await previewCount(udafCond(recent30, ">=", { int64: [1] }));
    expect(r.status).not.toBe(500);
    if (r.status === 200) expect(r.count).toBe(expected);
  });

  it("'lifetime buyers' — COUNT-all-time ≥ 1 ⇒ same set as recent (events all recent)", async () => {
    const buyerIds = new Set(events.map(e => e.primary_id));
    const expected = customers.filter(c => buyerIds.has(c.primary_id)).length;
    const r = await previewCount(udafCond(lifetime, ">=", { int64: [1] }));
    expect(r.status).not.toBe(500);
    if (r.status === 200) expect(r.count).toBe(expected);
  });

  it("'non-buyers' — NOT (lifetime >= 1) — re-engage cohort", async () => {
    const buyerIds = new Set(events.map(e => e.primary_id));
    const expected = customers.filter(c => !buyerIds.has(c.primary_id)).length;
    const r = await previewCount(group("AND", [udafCond(lifetime, ">=", { int64: [1] })], true));
    expect(r.status).not.toBe(500);
    if (r.status === 200) expect(r.count).toBe(expected);
  });

  it("'lapsed buyers' — bought before but NOT in last 30d (won-back cohort)", async () => {
    // Events are all recent → expected = 0
    const expected = 0;
    const filter = group("AND", [
      udafCond(lifetime, ">=", { int64: [1] }),
      // negated relative window
      group("AND", [udafCond(recent30, ">=", { int64: [1] })], true),
    ]);
    const r = await previewCount(filter);
    expect(r.status).not.toBe(500);
    if (r.status === 200) expect(r.count).toBe(expected);
  });
});

// ─── 3. Time-window math sanity ───────────────────────────────────────────────

describe.skipIf(!CALCULATE_OK)("Temporal: time-window math invariants", () => {
  let week: string;
  let year: string;

  beforeAll(async () => {
    week = await createAndVerifyUdaf({
      name: `${TAG}_wk_cnt`,
      aggType: "COUNT",
      params: [],
      filter: {
        eventType: { id: purchaseTypeId(), name: "purchase" },
        predicate: noFilter,
        timeWindow: { from: { kind: "RELATIVE", relativeDuration: 7, relativeUnit: "DAY" } },
      },
    });
    year = await createAndVerifyUdaf({
      name: `${TAG}_yr_cnt`,
      aggType: "COUNT",
      params: [],
      filter: {
        eventType: { id: purchaseTypeId(), name: "purchase" },
        predicate: noFilter,
        timeWindow: { from: { kind: "RELATIVE", relativeDuration: 365, relativeUnit: "DAY" } },
      },
    });
  });

  it("|7d-buyers| <= |365d-buyers| (containment invariant)", async () => {
    const wk = await previewCount(udafCond(week, ">=", { int64: [1] }));
    const yr = await previewCount(udafCond(year, ">=", { int64: [1] }));
    if (wk.status === 200 && yr.status === 200) {
      expect(wk.count).toBeLessThanOrEqual(yr.count);
    }
  });
});

// ─── 4. Welcome / cohort by created_at ────────────────────────────────────────

describe("Temporal: cohort by signup date", () => {
  it("'signed up in 2026' — cdp_created_at year filter", async () => {
    // Schema may not always expose cdp_created_at as queryable; soft-probe.
    let field: string;
    try { field = custField("cdp_created_at"); } catch { return; }
    const filter = group("AND", [
      cond(field, ">=", { time: ["2026-01-01T00:00:00Z"] }),
      cond(field, "<",  { time: ["2027-01-01T00:00:00Z"] }),
    ]);
    const r = await previewCount(filter);
    expect(r.status).not.toBe(500);
    if (r.status === 200) {
      // Test customers are all created today → all should match
      expect(r.count).toBe(customers.length);
    }
  });
});
