/**
 * V2 Data Query API tests — column selection, orderBy sorting, pagination,
 * UDAF columns, combined filter+sort+paginate, field reports.
 *
 * Uses shared dataset from globalSetup, scoped by primary_id IN [...].
 *
 * POST /api/v2/tenant/data/customers
 * POST /api/v2/tenant/data/events
 */
import { describe, it, expect } from "vitest";
import { post, get } from "../tests_backend/client";
import { custField, evtField, purchaseTypeId, getTenant } from "./tenant-context";
import {
  primaryIdScopePredicate, v2Filter, v2Cond,
} from "./test-factories";

const t = getTenant();
const { customers, events, runTag: TAG } = t;
const ids = customers.map(c => c.primary_id);
const expectedTotal = customers.length;
const expectedFemale = customers.filter(c => c.gender === 'female').length;

/** Scope filter — ANDs primary_id IN [...] with extra predicates */
function scopedFilter(extraPredicates: any[]) {
  return v2Filter([primaryIdScopePredicate(ids), ...extraPredicates]);
}

// ─── Column selection ────────────────────────────────────────────────────────

describe("V2 Customers: column selection (scoped)", () => {
  it("should return only requested field columns", async () => {
    const gc = custField("gender");
    const ec = custField("email");
    const { status, data } = await post("/api/v2/tenant/data/customers", {
      columns: [
        { fieldName: "primary_id", kind: "field" },
        { fieldName: gc, kind: "field" },
        { fieldName: ec, kind: "field" },
      ],
      orderBy: [],
      filter: scopedFilter([]),
      page: 0,
      size: 100,
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(expectedTotal);
    const row = data.list[0];
    expect(row).toHaveProperty("primary_id");
    expect(row).toHaveProperty(gc);
    expect(row).toHaveProperty(ec);
  });

  it("should return schema metadata matching requested columns", async () => {
    const gc = custField("gender");
    const { data } = await post("/api/v2/tenant/data/customers", {
      columns: [{ fieldName: gc, kind: "field" }],
      orderBy: [],
      filter: scopedFilter([]),
      page: 0,
      size: 1,
    });
    expect(data.schema).toBeDefined();
    expect(Array.isArray(data.schema)).toBe(true);
    const genderSchema = data.schema.find((s: any) => s.key === gc || s.apiName === "gender");
    expect(genderSchema).toBeDefined();
  });
});

// ─── UDAF as column ──────────────────────────────────────────────────────────

describe("V2 Customers: UDAF as column (scoped)", () => {
  let udafId: string;

  it("should create a UDAF and use it as a column", async () => {
    const { status, data } = await post("/api/tenants/udafs", {
      name: `${TAG}_col_count`,
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
    udafId = data.id;
  });

  it("should include UDAF values in table rows", async () => {
    if (!udafId) return;
    // Query without scoped filter — the UDAF ID itself is unique to this run.
    // On shared tenant, newly created UDAFs may not yet be materialized,
    // causing 500. We retry a few times to allow materialization.
    let status: number = 0;
    let data: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await post("/api/v2/tenant/data/customers", {
        columns: [
          { fieldName: "primary_id", kind: "field" },
          { artifactId: udafId, kind: "udaf" },
        ],
        orderBy: [],
        filter: {},
        page: 0,
        size: 100,
      });
      status = res.status;
      data = res.data;
      if (status === 200) break;
      await new Promise(r => setTimeout(r, 5_000));
    }
    expect(status).toBe(200);
    expect(data.list.length).toBeGreaterThanOrEqual(expectedTotal);
    const withUdaf = data.list.filter((row: any) => row.hasOwnProperty(udafId));
    expect(withUdaf.length).toBeGreaterThan(0);
  });
});

// ─── Sorting (orderBy) ──────────────────────────────────────────────────────

describe("V2 Customers: orderBy sorting (scoped)", () => {
  it("should sort by income ASC", async () => {
    const ic = custField("income");
    const { status, data } = await post("/api/v2/tenant/data/customers", {
      columns: [{ fieldName: "primary_id", kind: "field" }, { fieldName: ic, kind: "field" }],
      orderBy: [{ direction: "ASC", param: { fieldName: ic, kind: "field" } }],
      filter: scopedFilter([]),
      page: 0,
      size: 100,
    });
    expect(status).toBe(200);
    const incomes = data.list.map((r: any) => r[ic] ?? 0);
    for (let i = 1; i < incomes.length; i++) {
      expect(incomes[i]).toBeGreaterThanOrEqual(incomes[i - 1]);
    }
  });

  it("should sort by income DESC", async () => {
    const ic = custField("income");
    const { status, data } = await post("/api/v2/tenant/data/customers", {
      columns: [{ fieldName: "primary_id", kind: "field" }, { fieldName: ic, kind: "field" }],
      orderBy: [{ direction: "DESC", param: { fieldName: ic, kind: "field" } }],
      filter: scopedFilter([]),
      page: 0,
      size: 100,
    });
    expect(status).toBe(200);
    const incomes = data.list.map((r: any) => r[ic] ?? 0);
    for (let i = 1; i < incomes.length; i++) {
      expect(incomes[i]).toBeLessThanOrEqual(incomes[i - 1]);
    }
  });

  it("should sort by gender (VARCHAR) ASC", async () => {
    const gc = custField("gender");
    const { status, data } = await post("/api/v2/tenant/data/customers", {
      columns: [{ fieldName: "primary_id", kind: "field" }, { fieldName: gc, kind: "field" }],
      orderBy: [{ direction: "ASC", param: { fieldName: gc, kind: "field" } }],
      filter: scopedFilter([]),
      page: 0,
      size: 100,
    });
    expect(status).toBe(200);
    const genders = data.list.map((r: any) => r[gc] ?? "");
    for (let i = 1; i < genders.length; i++) {
      expect(genders[i] >= genders[i - 1]).toBe(true);
    }
  });
});

// ─── Pagination (scoped) ────────────────────────────────────────────────────

describe("V2 Customers: pagination (scoped)", () => {
  it("should respect page size", async () => {
    const { data } = await post("/api/v2/tenant/data/customers", {
      columns: [{ fieldName: "primary_id", kind: "field" }],
      orderBy: [],
      filter: scopedFilter([]),
      page: 0,
      size: 3,
    });
    expect(data.list.length).toBe(3);
  });

  it("page 0 and page 1 should return different rows (with orderBy)", async () => {
    const base = {
      columns: [{ fieldName: "primary_id", kind: "field" }],
      orderBy: [{ direction: "ASC", param: { fieldName: "primary_id", kind: "field" } }],
      filter: scopedFilter([]),
      size: 3,
    };
    const p0 = await post("/api/v2/tenant/data/customers", { ...base, page: 0 });
    const p1 = await post("/api/v2/tenant/data/customers", { ...base, page: 1 });

    const ids0 = p0.data.list.map((r: any) => r.primary_id);
    const ids1 = p1.data.list.map((r: any) => r.primary_id);
    for (const id of ids0) {
      expect(ids1).not.toContain(id);
    }
  });

  it("all pages should cover all customers", async () => {
    const allIds: number[] = [];
    for (let page = 0; page < Math.ceil(expectedTotal / 3) + 1; page++) {
      const { data } = await post("/api/v2/tenant/data/customers", {
        columns: [{ fieldName: "primary_id", kind: "field" }],
        orderBy: [],
        filter: scopedFilter([]),
        page,
        size: 3,
      });
      allIds.push(...data.list.map((r: any) => r.primary_id));
      if (data.list.length < 3) break;
    }
    expect(allIds.length).toBe(expectedTotal);
  });
});

// ─── Combined: filter + sort + paginate ──────────────────────────────────────

describe("V2 Customers: combined filter + paginate (scoped)", () => {
  it("filter female, page 0 size 2 — should return exactly 2 females (or fewer if < 2 exist)", async () => {
    const gc = custField("gender");
    const ic = custField("income");
    const pageSize = Math.min(2, expectedFemale);
    const { status, data } = await post("/api/v2/tenant/data/customers", {
      columns: [
        { fieldName: "primary_id", kind: "field" },
        { fieldName: gc, kind: "field" },
        { fieldName: ic, kind: "field" },
      ],
      orderBy: [],
      filter: scopedFilter([v2Cond(gc, "=", { string: ["female"] })]),
      page: 0,
      size: 2,
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(pageSize);
    for (const row of data.list) {
      expect(row[gc]).toBe("female");
    }
  });
});

// ─── V2 Events (scoped) ─────────────────────────────────────────────────────

describe("V2 Events: column selection and pagination (scoped)", () => {
  it("should query events with column selection", async () => {
    const { status, data } = await post("/api/v2/tenant/data/events", {
      eventTypeId: purchaseTypeId(),
      columns: [
        { fieldName: "primary_id", kind: "field" },
        { fieldName: evtField("total_price"), kind: "field" },
        { fieldName: evtField("delivery_city"), kind: "field" },
      ],
      orderBy: [],
      filter: v2Filter([primaryIdScopePredicate(ids)]),
      page: 0,
      size: 5,
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(5);
    const row = data.list[0];
    expect(row).toHaveProperty("primary_id");
    expect(row).toHaveProperty(evtField("total_price"));
    expect(row).toHaveProperty(evtField("delivery_city"));
  });

  it("should paginate events correctly", async () => {
    const base = {
      eventTypeId: purchaseTypeId(),
      columns: [{ fieldName: "primary_id", kind: "field" }],
      orderBy: [],
      filter: v2Filter([primaryIdScopePredicate(ids)]),
      size: 5,
    };
    const p0 = await post("/api/v2/tenant/data/events", { ...base, page: 0 });
    const p1 = await post("/api/v2/tenant/data/events", { ...base, page: 1 });
    expect(p0.status).toBe(200);
    expect(p1.status).toBe(200);
    expect(p0.data.list.length).toBe(5);
  });
});

// ─── UI Settings persistence (column config) ────────────────────────────────

describe("UI Settings: column configuration persistence", () => {
  const testKey = `test/columns/${TAG}`;

  it("should save column configuration", async () => {
    const { status } = await post("/api/tenant/ui/settings", {
      key: testKey,
      data: {
        customers: [
          { fieldName: custField("gender"), kind: "field" },
          { fieldName: custField("income"), kind: "field" },
          { fieldName: "primary_id", kind: "field" },
        ],
      },
    });
    expect(status).toBe(204);
  });

  it("should retrieve saved column configuration", async () => {
    const { status, data } = await get("/api/tenant/ui/settings/by-key", { key: testKey });
    expect(status).toBe(200);
    expect(data.data.customers.length).toBe(3);
    expect(data.data.customers[0].fieldName).toBe(custField("gender"));
  });
});
