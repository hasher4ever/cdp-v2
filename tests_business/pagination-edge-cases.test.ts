/**
 * Pagination & sorting edge case tests.
 *
 * Uses the shared 20-customer / 45-event dataset from globalSetup.
 * Data-scoped tests use primary_id IN [...] predicate.
 * Non-data tests (segmentation/campaign list pagination, field reports) remain global.
 */
import { describe, it, expect } from "vitest";
import { get, post } from "../tests_backend/client";
import {
  primaryIdScopePredicate, v2Filter,
} from "./test-factories";
import { custField, evtField, purchaseTypeId, getTenant } from "./tenant-context";

const t = getTenant();
const { customers, events, runTag: TAG } = t;

const N_CUSTOMERS = customers.length; // 20
const N_EVENTS = events.length;       // 45
const ourIds = customers.map(c => c.primary_id);
const scopePred = primaryIdScopePredicate(ourIds);

// ─── V2 Customers: scoped pagination ────────────────────────────────────────

describe("V2 Customers: scoped pagination with shared dataset", () => {
  it("page=0 size=5 should return 5 customers from our set", async () => {
    const { status, data } = await post("/api/v2/tenant/data/customers", {
      columns: [{ fieldName: "primary_id", kind: "field" }],
      orderBy: [{ direction: "ASC", param: { fieldName: "primary_id", kind: "field" } }],
      filter: v2Filter([scopePred]),
      page: 0,
      size: 5,
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(5);
  });

  it("paginating through all pages should yield exactly N_CUSTOMERS", async () => {
    const collected: number[] = [];
    for (let page = 0; page < 10; page++) {
      const { data } = await post("/api/v2/tenant/data/customers", {
        columns: [{ fieldName: "primary_id", kind: "field" }],
        orderBy: [{ direction: "ASC", param: { fieldName: "primary_id", kind: "field" } }],
        filter: v2Filter([scopePred]),
        page,
        size: 5,
      });
      if (data.list.length === 0) break;
      collected.push(...data.list.map((r: any) => r.primary_id));
    }
    expect(collected.length).toBe(N_CUSTOMERS);
    expect(new Set(collected).size).toBe(N_CUSTOMERS);
  });

  it("page far beyond data should return empty list", async () => {
    const { status, data } = await post("/api/v2/tenant/data/customers", {
      columns: [{ fieldName: "primary_id", kind: "field" }],
      orderBy: [],
      filter: v2Filter([scopePred]),
      page: 999,
      size: 10,
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(0);
  });

  it("size larger than total should return all N_CUSTOMERS", async () => {
    const { status, data } = await post("/api/v2/tenant/data/customers", {
      columns: [{ fieldName: "primary_id", kind: "field" }],
      orderBy: [],
      filter: v2Filter([scopePred]),
      page: 0,
      size: 1000,
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(N_CUSTOMERS);
  });
});

// ─── V2 Customers: sort by every field type (scoped) ────────────────────────

describe("V2 Customers: sort stability across field types (scoped)", () => {
  const fieldTypes = [
    { name: "gender", type: "VARCHAR" },
    { name: "age", type: "BIGINT" },
    { name: "income", type: "DOUBLE" },
    { name: "is_adult", type: "BOOL" },
    { name: "birthdate", type: "DATE" },
  ];

  for (const { name, type } of fieldTypes) {
    it(`should sort by ${name} (${type}) ASC without error`, async () => {
      const fc = custField(name);
      const { status, data } = await post("/api/v2/tenant/data/customers", {
        columns: [{ fieldName: "primary_id", kind: "field" }, { fieldName: fc, kind: "field" }],
        orderBy: [{ direction: "ASC", param: { fieldName: fc, kind: "field" } }],
        filter: v2Filter([scopePred]),
        page: 0,
        size: 50,
      });
      expect(status).toBe(200);
      expect(data.list.length).toBe(N_CUSTOMERS);
    });

    it(`should sort by ${name} (${type}) DESC without error`, async () => {
      const fc = custField(name);
      const { status, data } = await post("/api/v2/tenant/data/customers", {
        columns: [{ fieldName: "primary_id", kind: "field" }, { fieldName: fc, kind: "field" }],
        orderBy: [{ direction: "DESC", param: { fieldName: fc, kind: "field" } }],
        filter: v2Filter([scopePred]),
        page: 0,
        size: 50,
      });
      expect(status).toBe(200);
      expect(data.list.length).toBe(N_CUSTOMERS);
    });
  }
});

// ─── V2 Customers: multi-column sort (scoped) ──────────────────────────────

describe("V2 Customers: multi-column orderBy (scoped)", () => {
  it("should sort by gender ASC then income DESC within our set", async () => {
    const gc = custField("gender");
    const ic = custField("income");
    const { status, data } = await post("/api/v2/tenant/data/customers", {
      columns: [
        { fieldName: "primary_id", kind: "field" },
        { fieldName: gc, kind: "field" },
        { fieldName: ic, kind: "field" },
      ],
      orderBy: [
        { direction: "ASC", param: { fieldName: gc, kind: "field" } },
        { direction: "DESC", param: { fieldName: ic, kind: "field" } },
      ],
      filter: v2Filter([scopePred]),
      page: 0,
      size: 50,
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(N_CUSTOMERS);
    // Verify primary sort: gender ASC
    const genders = data.list.map((r: any) => r[gc] ?? "");
    for (let i = 1; i < genders.length; i++) {
      expect(genders[i] >= genders[i - 1]).toBe(true);
    }
    // Verify secondary sort: within same gender, income DESC
    for (let i = 1; i < data.list.length; i++) {
      if (data.list[i][gc] === data.list[i - 1][gc]) {
        expect((data.list[i][ic] ?? 0) <= (data.list[i - 1][ic] ?? 0)).toBe(true);
      }
    }
  });
});

// ─── V2 Events: scoped pagination ───────────────────────────────────────────

describe("V2 Events: pagination with shared dataset (scoped)", () => {
  it("size=1 should return exactly 1 event from our set", async () => {
    const { status, data } = await post("/api/v2/tenant/data/events", {
      eventTypeId: purchaseTypeId(),
      columns: [{ fieldName: "primary_id", kind: "field" }],
      orderBy: [],
      filter: v2Filter([scopePred]),
      page: 0,
      size: 1,
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(1);
  });

  it("large page offset should return empty", async () => {
    const { status, data } = await post("/api/v2/tenant/data/events", {
      eventTypeId: purchaseTypeId(),
      columns: [{ fieldName: "primary_id", kind: "field" }],
      orderBy: [],
      filter: v2Filter([scopePred]),
      page: 999,
      size: 10,
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(0);
  });

  it("all pages combined should equal N_EVENTS", async () => {
    const allRows: any[] = [];
    for (let page = 0; page < 20; page++) {
      const { data } = await post("/api/v2/tenant/data/events", {
        eventTypeId: purchaseTypeId(),
        columns: [{ fieldName: "primary_id", kind: "field" }],
        orderBy: [],
        filter: v2Filter([scopePred]),
        page,
        size: 5,
      });
      if (data.list.length === 0) break;
      allRows.push(...data.list);
    }
    expect(allRows.length).toBe(N_EVENTS);
  });
});

// ─── Global pagination tests (no factory data needed) ───────────────────────

describe("Segmentation List: pagination boundaries", () => {
  it("page=0 size=1 should return at most 1 item", async () => {
    const { status, data } = await get("/api/tenants/segmentation", { page: 0, size: 1 });
    expect(status).toBe(200);
    expect(data.items.length).toBeLessThanOrEqual(1);
  });

  it("large page should return empty items", async () => {
    const { status, data } = await get("/api/tenants/segmentation", { page: 9999, size: 10 });
    expect(status).toBe(200);
    expect(data.items.length).toBe(0);
  });
});

describe("Campaign List: pagination boundaries", () => {
  it("large page should return empty items", async () => {
    const { status, data } = await get("/api/tenants/campaign", { page: 9999, size: 10 });
    expect(status).toBe(200);
    expect(data.items.length).toBe(0);
  });
});

describe("Field Reports: pagination (scoped by shared dataset gender values)", () => {
  it("page 0, size 1 should return 1 value", async () => {
    const { status, data } = await get("/api/tenant/data/reports/field-values", {
      table: "customers",
      field: custField("gender"),
      order_by: "count",
      sort_order: "desc",
      page: 0,
      size: 1,
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(1);
  });

  it("should sort by count ASC", async () => {
    const { status, data } = await get("/api/tenant/data/reports/field-values", {
      table: "customers",
      field: custField("gender"),
      order_by: "count",
      sort_order: "asc",
      page: 0,
      size: 10,
    });
    expect(status).toBe(200);
    const counts = data.list.map((r: any) => r.count);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });
});
