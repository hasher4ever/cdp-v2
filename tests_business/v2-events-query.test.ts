/**
 * V2 Events API — filtering, sorting, and column selection.
 * Uses shared dataset from globalSetup, scoped by primary_id IN [...].
 *
 * POST /api/v2/tenant/data/events
 */
import { describe, it, expect } from "vitest";
import { post } from "../tests_backend/client";
import { evtField, purchaseTypeId, getTenant } from "./tenant-context";
import {
  primaryIdScopePredicate, v2Filter, v2Cond,
} from "./test-factories";

const t = getTenant();
const { customers, events, runTag: TAG } = t;
const ids = customers.map(c => c.primary_id);

// Pre-computed expected counts
const expectedCardEvents = events.filter(e => e.payment_type === 'card').length;
const expectedCashEvents = events.filter(e => e.payment_type === 'cash').length;
const expectedPendingEvents = events.filter(e => e.purchase_status === 'pending').length;
const expectedCompletedEvents = events.filter(e => e.purchase_status === 'completed').length;
const expectedHighPrice = events.filter(e => e.total_price >= 500).length;
const expectedLowPrice = events.filter(e => e.total_price < 50).length;
const tashkentTag = `Tashkent_${TAG}`;
const expectedTashkentEvents = events.filter(e => e.delivery_city === tashkentTag).length;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function queryEvents(opts: { columns?: any[]; orderBy?: any[]; filter?: any; page?: number; size?: number }) {
  return post("/api/v2/tenant/data/events", {
    eventTypeId: purchaseTypeId(),
    columns: opts.columns ?? [
      { fieldName: "primary_id", kind: "field" },
      { fieldName: evtField("delivery_city"), kind: "field" },
      { fieldName: evtField("total_price"), kind: "field" },
      { fieldName: evtField("payment_type"), kind: "field" },
    ],
    orderBy: opts.orderBy ?? [],
    filter: opts.filter ?? {},
    page: opts.page ?? 0,
    size: opts.size ?? 200,
  });
}

/** Scope filter — all additional predicates are ANDed with primary_id IN [...] */
function scopedFilter(extraPredicates: any[]) {
  return v2Filter([primaryIdScopePredicate(ids), ...extraPredicates]);
}

// ─── Filter by delivery_city (tagged) ────────────────────────────────────────

describe("V2 Events: filter by tagged delivery_city", () => {
  it(`delivery_city = 'Tashkent_<tag>' → expected count`, async () => {
    const dc = evtField("delivery_city");
    const { status, data } = await queryEvents({
      filter: scopedFilter([v2Cond(dc, "=", { string: [tashkentTag] })]),
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(expectedTashkentEvents);
    for (const row of data.list) {
      expect(row[dc]).toBe(tashkentTag);
    }
  });
});

// ─── Filter by payment_type (scoped) ─────────────────────────────────────────

describe("V2 Events: filter by payment_type (scoped)", () => {
  it("payment_type = 'card' → expected count", async () => {
    const pt = evtField("payment_type");
    const { status, data } = await queryEvents({
      filter: scopedFilter([v2Cond(pt, "=", { string: ["card"] })]),
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(expectedCardEvents);
  });

  it("payment_type = 'cash' → expected count", async () => {
    const pt = evtField("payment_type");
    const { status, data } = await queryEvents({
      filter: scopedFilter([v2Cond(pt, "=", { string: ["cash"] })]),
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(expectedCashEvents);
  });
});

// ─── Filter by total_price (scoped) ──────────────────────────────────────────

describe("V2 Events: filter by total_price (scoped)", () => {
  it("total_price >= 500 → high-value events", async () => {
    const tp = evtField("total_price");
    const { status, data } = await queryEvents({
      filter: scopedFilter([v2Cond(tp, ">=", { float64: [500] })]),
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(expectedHighPrice);
    for (const row of data.list) {
      expect(row[tp]).toBeGreaterThanOrEqual(500);
    }
  });

  it("total_price < 50 → small events", async () => {
    const tp = evtField("total_price");
    const { status, data } = await queryEvents({
      filter: scopedFilter([v2Cond(tp, "<", { float64: [50] })]),
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(expectedLowPrice);
  });
});

// ─── Combined filters (scoped) ──────────────────────────────────────────────

describe("V2 Events: combined filters (scoped)", () => {
  it("city = Tashkent_<tag> AND payment_type = card → expected subset", async () => {
    const dc = evtField("delivery_city");
    const pt = evtField("payment_type");
    const expectedCount = events.filter(
      e => e.delivery_city === tashkentTag && e.payment_type === 'card'
    ).length;

    const { status, data } = await queryEvents({
      filter: scopedFilter([
        v2Cond(dc, "=", { string: [tashkentTag] }),
        v2Cond(pt, "=", { string: ["card"] }),
      ]),
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(expectedCount);
    for (const row of data.list) {
      expect(row[dc]).toBe(tashkentTag);
      expect(row[pt]).toBe("card");
    }
  });

  it("total_price >= 500 AND payment_type = card → expected subset", async () => {
    const tp = evtField("total_price");
    const pt = evtField("payment_type");
    const expectedCount = events.filter(
      e => e.total_price >= 500 && e.payment_type === 'card'
    ).length;

    const { status, data } = await queryEvents({
      filter: scopedFilter([
        v2Cond(tp, ">=", { float64: [500] }),
        v2Cond(pt, "=", { string: ["card"] }),
      ]),
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(expectedCount);
  });
});

// ─── Filter by purchase_status (scoped) ──────────────────────────────────────

describe("V2 Events: filter by purchase_status (scoped)", () => {
  it("purchase_status = 'pending' → expected count", async () => {
    const ps = evtField("purchase_status");
    const { status, data } = await queryEvents({
      columns: [
        { fieldName: "primary_id", kind: "field" },
        { fieldName: ps, kind: "field" },
      ],
      filter: scopedFilter([v2Cond(ps, "=", { string: ["pending"] })]),
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(expectedPendingEvents);
  });

  it("purchase_status = 'completed' → expected count", async () => {
    const ps = evtField("purchase_status");
    const { status, data } = await queryEvents({
      columns: [
        { fieldName: "primary_id", kind: "field" },
        { fieldName: ps, kind: "field" },
      ],
      filter: scopedFilter([v2Cond(ps, "=", { string: ["completed"] })]),
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(expectedCompletedEvents);
  });
});

// ─── Sorting (scoped) ────────────────────────────────────────────────────────

describe("V2 Events: sorting (scoped)", () => {
  it("sort by total_price ASC within our data", async () => {
    const tp = evtField("total_price");
    const { status, data } = await queryEvents({
      filter: scopedFilter([]),
      orderBy: [{ direction: "ASC", param: { fieldName: tp, kind: "field" } }],
      size: 200,
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(events.length);
    const prices = data.list.map((r: any) => r[tp] ?? 0);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    }
  });

  it("sort by total_price DESC within our data", async () => {
    const tp = evtField("total_price");
    const { status, data } = await queryEvents({
      filter: scopedFilter([]),
      orderBy: [{ direction: "DESC", param: { fieldName: tp, kind: "field" } }],
      size: 200,
    });
    expect(status).toBe(200);
    const prices = data.list.map((r: any) => r[tp] ?? 0);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeLessThanOrEqual(prices[i - 1]);
    }
  });

  it("sort by delivery_city ASC within our data", async () => {
    const dc = evtField("delivery_city");
    const { status, data } = await queryEvents({
      filter: scopedFilter([]),
      orderBy: [{ direction: "ASC", param: { fieldName: dc, kind: "field" } }],
      size: 200,
    });
    expect(status).toBe(200);
    const cities = data.list.map((r: any) => r[dc] ?? "");
    for (let i = 1; i < cities.length; i++) {
      expect(cities[i] >= cities[i - 1]).toBe(true);
    }
  });
});

// ─── Filter + sort + paginate (scoped) ───────────────────────────────────────

describe("V2 Events: filter + sort + paginate (scoped)", () => {
  it("Tashkent events sorted by price DESC, page 0 size 3", async () => {
    const tp = evtField("total_price");
    const dc = evtField("delivery_city");
    const { status, data } = await queryEvents({
      filter: scopedFilter([v2Cond(dc, "=", { string: [tashkentTag] })]),
      orderBy: [{ direction: "DESC", param: { fieldName: tp, kind: "field" } }],
      page: 0,
      size: 3,
    });
    expect(status).toBe(200);
    // May be fewer than 3 if fewer Tashkent events exist
    expect(data.list.length).toBeLessThanOrEqual(3);
    const prices = data.list.map((r: any) => r[tp]);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeLessThanOrEqual(prices[i - 1]);
    }
  });
});
