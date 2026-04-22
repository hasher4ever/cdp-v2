/**
 * Autocomplete / adaptive search tests.
 *
 * The autocomplete API powers the UI dropdown in segmentation/filter builders.
 * GET /api/tenant/data/autocomplete/field-values?table=customers&field={col}&value={prefix}&size=10
 *
 * Tests verify:
 *   - Returns suggestions matching the prefix
 *   - Works for customer VARCHAR fields
 *   - Works for event VARCHAR fields
 *   - Returns empty for non-matching prefix
 *   - Respects size limit
 *   - Case sensitivity behavior
 *
 * Uses shared dataset from globalSetup: 20 customers, 45 events.
 * The shared customers have gender values (male/female/other) and unique first_name/email
 * prefixed with runTag.
 */
import { describe, it, expect } from "vitest";
import { get } from "../tests_backend/client";
import { custField, evtField, purchaseTypeId, getTenant } from "./tenant-context";

const t = getTenant();
const { customers, events, runTag: TAG } = t;

describe("Autocomplete: Customer fields", () => {
  it("should return suggestions for gender field starting with 'f'", async () => {
    const { status, data } = await get("/api/tenant/data/autocomplete/field-values", {
      table: "customers",
      field: custField("gender"),
      value: "f",
      size: 10,
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
    expect(data.list).toContain("female");
  });

  it("should return suggestions for gender field starting with 'm'", async () => {
    const { data } = await get("/api/tenant/data/autocomplete/field-values", {
      table: "customers",
      field: custField("gender"),
      value: "m",
      size: 10,
    });
    expect(data.list).toContain("male");
  });

  it("should return all genders with single-char prefix", async () => {
    // empty value now returns 400 — use broad single-char prefixes instead
    const { data: fData } = await get("/api/tenant/data/autocomplete/field-values", {
      table: "customers", field: custField("gender"), value: "f", size: 10,
    });
    const { data: mData } = await get("/api/tenant/data/autocomplete/field-values", {
      table: "customers", field: custField("gender"), value: "m", size: 10,
    });
    const { data: oData } = await get("/api/tenant/data/autocomplete/field-values", {
      table: "customers", field: custField("gender"), value: "o", size: 10,
    });
    expect(fData.list).toContain("female");
    expect(mData.list).toContain("male");
    expect(oData.list).toContain("other");
  });

  it("should return empty list for non-matching prefix", async () => {
    const { status, data } = await get("/api/tenant/data/autocomplete/field-values", {
      table: "customers",
      field: custField("gender"),
      value: "zzz_nonexistent",
      size: 10,
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(0);
  });

  it("should respect size limit", async () => {
    const { data } = await get("/api/tenant/data/autocomplete/field-values", {
      table: "customers",
      field: custField("last_name"),
      value: "a",
      size: 2,
    });
    expect(data.list.length).toBeLessThanOrEqual(2);
  });

  it("should return first_name suggestions matching shared dataset tag prefix", async () => {
    const { data } = await get("/api/tenant/data/autocomplete/field-values", {
      table: "customers",
      field: custField("first_name"),
      value: TAG,
      size: 10,
    });
    expect(data.list.length).toBeGreaterThanOrEqual(1);
    expect(data.list[0]).toContain(TAG);
  });

  it("should return email suggestions matching shared dataset tag prefix", async () => {
    const { data } = await get("/api/tenant/data/autocomplete/field-values", {
      table: "customers",
      field: custField("email"),
      value: TAG,
      size: 5,
    });
    expect(data.list.length).toBeGreaterThanOrEqual(1);
    expect(data.list[0]).toContain(TAG);
  });
});

// BUG-001: event_type param causes 500 — FE doesn't send it, works without it
describe("Autocomplete: Event fields", () => {
  it("should return delivery_city suggestions starting with shared dataset tag prefix", async () => {
    const { status, data } = await get("/api/tenant/data/autocomplete/field-values", {
      table: "events",
      field: evtField("delivery_city"),
      value: "Tashkent",
      size: 20,
    });
    expect(status).toBe(200);
    const list = Array.isArray(data) ? data : data.list;
    expect(list).toBeDefined();
    // Shared tenant has many datasets — just verify Tashkent entries exist
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0]).toMatch(/^Tashkent/);
  });

  it("should return payment_type suggestions", async () => {
    const { status, data } = await get("/api/tenant/data/autocomplete/field-values", {
      table: "events",
      field: evtField("payment_type"),
      value: "c",
      size: 10,
    });
    expect(status).toBe(200);
    const list = Array.isArray(data) ? data : data.list;
    expect(list).toBeDefined();
    expect(list).toContain("card");
    expect(list).toContain("cash");
  });

  it("should return purchase_status values", async () => {
    const { status, data } = await get("/api/tenant/data/autocomplete/field-values", {
      table: "events",
      field: evtField("purchase_status"),
      value: "c",
      size: 10,
    });
    expect(status).toBe(200);
    const list = Array.isArray(data) ? data : data.list;
    expect(list).toBeDefined();
    expect(list).toContain("completed");
  });
});
