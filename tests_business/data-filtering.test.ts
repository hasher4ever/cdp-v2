/**
 * Customer data verification and filtering tests — shared dataset from globalSetup.
 *
 * Queries are scoped to the shared dataset's exact primary IDs.
 * Expected counts are computed from the shared customer/event arrays.
 */
import { describe, it, expect } from "vitest";
import { get, post } from "../tests_backend/client";
import { custField, evtField, purchaseTypeId, getTenant } from "./tenant-context";
import {
  primaryIdScopePredicate, v2Filter, v2Cond,
} from "./test-factories";

const t = getTenant();
const { customers, events, runTag: TAG } = t;
const ids = customers.map(c => c.primary_id);

// Pre-computed expected counts
const expectedFemale = customers.filter(c => c.gender === 'female').length;
const expectedAdults = customers.filter(c => c.is_adult).length;
const expectedMinors = customers.filter(c => !c.is_adult).length;
const expectedUnsubscribed = customers.filter(c => !c.is_subscribed).length;
const expectedIncomeAbove100k = customers.filter(c => c.income > 100000).length;

// Per-customer event counts
const eventsById = new Map<number, number>();
for (const e of events) {
  eventsById.set(e.primary_id, (eventsById.get(e.primary_id) ?? 0) + 1);
}
const custWithEvents = customers.find(c => (eventsById.get(c.primary_id) ?? 0) > 0)!;
const custWithEventsCount = eventsById.get(custWithEvents?.primary_id) ?? 0;
const custWithZeroEvents = customers.find(c => (eventsById.get(c.primary_id) ?? 0) === 0);

// ─── Customer Data Verification ──────────────────────────────────────────────

describe("Customer Data Verification After Ingest", () => {
  it("should find all test customers by primary_id", async () => {
    for (const cust of customers) {
      const { status, data } = await get(`/api/tenant/data/customers/${cust.primary_id}`);
      expect(status).toBe(200);
      expect(data).toHaveProperty("fields");
    }
  });

  it("should return correct field values for first customer", async () => {
    const cust = customers[0];
    const { data } = await get(`/api/tenant/data/customers/${cust.primary_id}`);
    const f = data.fields;

    expect(f[custField("gender")]).toBe(cust.gender);
    expect(f[custField("email")]).toBe(cust.email);
    if (cust.is_adult) {
      expect(f[custField("is_adult")]).toBeTruthy();
    } else {
      expect(f[custField("is_adult")]).toBeFalsy();
    }
    expect(f[custField("income")]).toBe(cust.income);
  });

  it("should return correct age for a minor (if any)", async () => {
    const minor = customers.find(c => !c.is_adult);
    if (!minor) return; // no minors in dataset — skip
    const { data } = await get(`/api/tenant/data/customers/${minor.primary_id}`);
    const f = data.fields;
    expect(f[custField("is_adult")]).toBeFalsy();
    expect(f[custField("age")]).toBe(minor.age);
  });
});

// ─── Customer Filtering via v2 API ───────────────────────────────────────────

describe("Customer Filtering via v2 API (scoped)", () => {
  it(`should filter by gender = female`, async () => {
    const gc = custField("gender");
    const payload = {
      columns: [
        { fieldName: "primary_id", kind: "field" },
        { fieldName: gc, kind: "field" },
      ],
      orderBy: [],
      filter: v2Filter([
        primaryIdScopePredicate(ids),
        v2Cond(gc, "=", { string: ["female"] }),
      ]),
      page: 0,
      size: 1000,
    };

    const { status, data } = await post("/api/v2/tenant/data/customers", payload);
    expect(status).toBe(200);
    expect(data.list.length).toBe(expectedFemale);
    for (const row of data.list) {
      expect(row[gc]).toBe("female");
    }
  });

  it("should filter by is_adult = true", async () => {
    const ac = custField("is_adult");
    const payload = {
      columns: [
        { fieldName: "primary_id", kind: "field" },
        { fieldName: ac, kind: "field" },
      ],
      orderBy: [],
      filter: v2Filter([
        primaryIdScopePredicate(ids),
        v2Cond(ac, "=", { bool: [true] }),
      ]),
      page: 0,
      size: 1000,
    };

    const { status, data } = await post("/api/v2/tenant/data/customers", payload);
    expect(status).toBe(200);
    expect(data.list.length).toBe(expectedAdults);
  });

  it("should filter by is_subscribed = false", async () => {
    const sc = custField("is_subscribed");
    const payload = {
      columns: [
        { fieldName: "primary_id", kind: "field" },
        { fieldName: sc, kind: "field" },
      ],
      orderBy: [],
      filter: v2Filter([
        primaryIdScopePredicate(ids),
        v2Cond(sc, "=", { bool: [false] }),
      ]),
      page: 0,
      size: 1000,
    };

    const { status, data } = await post("/api/v2/tenant/data/customers", payload);
    expect(status).toBe(200);
    expect(data.list.length).toBe(expectedUnsubscribed);
  });

  it("should filter by income > 100000", async () => {
    const ic = custField("income");
    const payload = {
      columns: [
        { fieldName: "primary_id", kind: "field" },
        { fieldName: ic, kind: "field" },
      ],
      orderBy: [],
      filter: v2Filter([
        primaryIdScopePredicate(ids),
        v2Cond(ic, ">", { float64: [100000] }),
      ]),
      page: 0,
      size: 1000,
    };

    const { status, data } = await post("/api/v2/tenant/data/customers", payload);
    expect(status).toBe(200);
    expect(data.list.length).toBe(expectedIncomeAbove100k);
  });

  it("should filter by age < 18 (minors)", async () => {
    const ac = custField("age");
    const payload = {
      columns: [
        { fieldName: "primary_id", kind: "field" },
        { fieldName: ac, kind: "field" },
      ],
      orderBy: [],
      filter: v2Filter([
        primaryIdScopePredicate(ids),
        v2Cond(ac, "<", { int64: [18] }),
      ]),
      page: 0,
      size: 1000,
    };

    const { status, data } = await post("/api/v2/tenant/data/customers", payload);
    expect(status).toBe(200);
    expect(data.list.length).toBe(expectedMinors);
  });

  it("should filter by is_adult = true AND income > 100000", async () => {
    const adultCol = custField("is_adult");
    const incomeCol = custField("income");
    const expectedCount = customers.filter(c => c.is_adult && c.income > 100000).length;

    const payload = {
      columns: [
        { fieldName: "primary_id", kind: "field" },
        { fieldName: adultCol, kind: "field" },
        { fieldName: incomeCol, kind: "field" },
      ],
      orderBy: [],
      filter: v2Filter([
        primaryIdScopePredicate(ids),
        v2Cond(adultCol, "=", { bool: [true] }),
        v2Cond(incomeCol, ">", { float64: [100000] }),
      ]),
      page: 0,
      size: 100,
    };

    const { status, data } = await post("/api/v2/tenant/data/customers", payload);
    expect(status).toBe(200);
    expect(data.list.length).toBe(expectedCount);
  });
});

// ─── Event Data Verification ─────────────────────────────────────────────────

describe("Event Data Verification After Ingest", () => {
  it("should find expected event count for a customer with events", async () => {
    const { status, data } = await post(
      "/api/tenant/data/events",
      { fieldNames: ["primary_id"] },
      { event_type_id: purchaseTypeId(), primary_id: custWithEvents.primary_id, page: 0, size: 100 }
    );
    expect(status).toBe(200);
    expect(data.list.length).toBe(custWithEventsCount);
  });

  it("should find 0 events for a customer with no events (if any)", async () => {
    if (!custWithZeroEvents) return; // all customers got events this run
    const { status, data } = await post(
      "/api/tenant/data/events",
      { fieldNames: ["primary_id"] },
      { event_type_id: purchaseTypeId(), primary_id: custWithZeroEvents.primary_id, page: 0, size: 10 }
    );
    expect(status).toBe(200);
    expect(data.list.length).toBe(0);
  });
});
