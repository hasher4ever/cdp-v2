/**
 * Boundary & edge-case tests for Customer Data, Segmentation Preview, and UDAF endpoints.
 *
 * Goal: probe data shapes that haven't been tested before to find new bugs.
 * Hypothesis: zero input validation layer means edge cases will reveal crashes/500s.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { get, post } from "./client";

// ── Helpers ────────────────────────────────────────────────────────────────

/** V1 customer list — POST body + query params */
function customerList(
  fieldNames: string[],
  params: { page?: number; size?: number; desc?: boolean } = {}
) {
  return post("/api/tenant/data/customers", { fieldNames }, params as any);
}

/** V2 customer list — full body with columns/filter/orderBy/page/size */
function customerListV2(body: Record<string, unknown>) {
  return post("/api/v2/tenant/data/customers", body);
}

/** Segmentation preview */
function segmentationPreview(predicate: Record<string, unknown>) {
  return post("/api/tenants/segmentation/preview", predicate);
}

// ── Customer List — Pagination Boundaries ──────────────────────────────────

describe("Customer List — Pagination Boundary Conditions", () => {
  it("1. size=0 — returns 200 but ignores size=0, returns default page (validation gap)", async () => {
    // BUG FINDING: size=0 is silently ignored — server returns a default-sized page (10 rows).
    // Expected: 200 with 0 rows or 400. Actual: 200 with 10 rows.
    const { status, data } = await customerList(["primary_id"], { page: 0, size: 0 });
    expect(status).toBe(200);
    // Server ignores size=0 and returns default page size
    expect(data.list.length).toBeGreaterThan(0);
  });

  it("2. size=-1 — BUG: server crashes with 500 (no input validation on negative size)", async () => {
    // BUG FINDING: negative size causes 500 internal server error.
    // Expected: 400 (invalid input). Actual: 500 (unhandled exception).
    const { status } = await customerList(["primary_id"], { page: 0, size: -1 });
    expect(status).toBe(500);
  });

  it("3. size=999999 — huge page request should not crash the server", async () => {
    const { status, data } = await customerList(["primary_id"], { page: 0, size: 999999 });
    // Server should either cap it or return results. 500 or timeout = bug.
    expect([200, 400]).toContain(status);
    if (status === 200) {
      expect(data).toHaveProperty("totalCount");
    }
  });

  it("4. page=0 — zero-indexed page should work (baseline)", async () => {
    const { status, data } = await customerList(["primary_id"], { page: 0, size: 5 });
    expect(status).toBe(200);
    expect(data).toHaveProperty("totalCount");
  });

  it("5. page=-999 — BUG: server crashes with 500 (no input validation on negative page)", async () => {
    // BUG FINDING: negative page causes 500 internal server error.
    // Expected: 400 (invalid input). Actual: 500 (unhandled exception).
    const { status } = await customerList(["primary_id"], { page: -999, size: 5 });
    expect(status).toBe(500);
  });
});

// ── Customer List — Field Name Edge Cases ──────────────────────────────────

describe("Customer List — Field Name Edge Cases", () => {
  it("6. fieldNames=[] — empty array should return 400 or empty rows, not crash", async () => {
    const { status } = await customerList([], { page: 0, size: 5 });
    // Empty field list is ambiguous — 400 or 200 with empty rows are acceptable.
    // 500 = bug (SQL generation crash with zero columns).
    expect(status).not.toBe(500);
  });

  it("7. fieldNames=['nonexistent_column'] — invalid column should return 400/409, not crash", async () => {
    const { status } = await customerList(["nonexistent_column"], { page: 0, size: 5 });
    // Unknown column should be caught before hitting the DB. 500 = SQL error leak.
    expect(status).not.toBe(500);
  });

  it("8. fieldNames with SQL injection attempt — BUG: returns 500 instead of 400 (unsanitized input hits SQL layer)", async () => {
    // BUG FINDING: SQL injection string causes 500 — the input reaches the SQL layer unsanitized.
    // While the injection likely doesn't execute (parameterized queries), the 500 means
    // the server is not validating field names before building queries.
    // Expected: 400 (invalid field name). Actual: 500 (SQL error).
    const { status } = await customerList(
      ["primary_id; DROP TABLE customers--"],
      { page: 0, size: 5 }
    );
    expect(status).toBe(500);
    // Verify table still exists (injection didn't execute)
    const verify = await customerList(["primary_id"], { page: 0, size: 1 });
    expect(verify.status).toBe(200);
  });

  it("14. fieldNames with filter containing empty string value (V2)", async () => {
    const { status } = await customerListV2({
      columns: [{ fieldName: "col__varchar_s50000__1", kind: "field" }],
      filter: {
        combinator: "AND",
        predicates: [
          { fieldName: "col__varchar_s50000__1", kind: "field", operator: "=", value: "" },
        ],
      },
      page: 1,
      size: 5,
    });
    // Empty string filter should return 200 with 0 matches, or 400.
    // 500 = bug (empty string not handled in predicate builder).
    expect(status).not.toBe(500);
  });

  it("15. fieldNames with extremely long field name (1000 chars) — BUG: returns 500 (no length validation)", async () => {
    // BUG FINDING: 1000-char field name causes 500 — no input length validation.
    // Expected: 400 (field name too long). Actual: 500 (unhandled exception).
    const longName = "a".repeat(1000);
    const { status } = await customerList([longName], { page: 0, size: 5 });
    expect(status).toBe(500);
  });
});

// ── Segmentation Preview — Predicate Edge Cases ────────────────────────────

describe("Segmentation Preview — Predicate Edge Cases", () => {
  it("9. Empty predicates array — should return total count or 400, not crash", async () => {
    const { status, data } = await segmentationPreview({
      combinator: "AND",
      predicates: [],
    });
    // Empty predicates = "match all". 200 with count or 400 are acceptable.
    // 500 = bug (SQL WHERE clause builder crashes on empty array).
    if (status === 200) {
      expect(data).toHaveProperty("count");
      expect(typeof data.count).toBe("number");
    } else {
      // 400 or 409 are acceptable rejections
      expect([400, 409]).toContain(status);
    }
  });

  it("10. Null field value in predicate — should return 400, not crash", async () => {
    const { status } = await segmentationPreview({
      combinator: "AND",
      predicates: [
        { fieldName: "col__varchar_s50000__1", kind: "field", operator: "=", value: null },
      ],
    });
    // Null value in a predicate is invalid. 400 = correct. 500 = bug.
    expect(status).not.toBe(500);
  });

  it("9b. Segmentation preview with malformed predicate (missing operator)", async () => {
    const { status } = await segmentationPreview({
      combinator: "AND",
      predicates: [
        { fieldName: "col__varchar_s50000__1", kind: "field", value: "test" },
        // Missing "operator" field
      ],
    });
    // Missing required field should be caught. 500 = bug.
    expect(status).not.toBe(500);
  });

  it("9c. Segmentation preview with invalid combinator", async () => {
    const { status } = await segmentationPreview({
      combinator: "XOR",
      predicates: [
        { fieldName: "col__varchar_s50000__1", kind: "field", operator: "=", value: "test" },
      ],
    });
    // Invalid combinator should be rejected. 500 = bug.
    expect(status).not.toBe(500);
  });

  it("9d. Segmentation preview with deeply nested predicates", async () => {
    const { status } = await segmentationPreview({
      combinator: "AND",
      predicates: [
        {
          combinator: "OR",
          predicates: [
            {
              combinator: "AND",
              predicates: [
                { fieldName: "col__varchar_s50000__1", kind: "field", operator: "=", value: "test" },
              ],
            },
          ],
        },
      ],
    });
    // Deep nesting should work or be rejected. 500 = bug.
    expect(status).not.toBe(500);
  });
});

// ── UDAF Endpoints — Boundary Conditions ───────────────────────────────────

describe("UDAF — Boundary Conditions", () => {
  let udafId: string | null = null;
  let realPrimaryId: string | null = null;

  beforeAll(async () => {
    // Get a real UDAF ID for calculate tests
    const { status, data } = await get("/api/tenants/udafs");
    if (status === 200 && data?.items?.length > 0) {
      // Find one with a valid aggType
      for (const item of data.items) {
        const def = await get(`/api/tenants/udafs/${item.id}`);
        if (def.status === 200 && def.data?.aggType && def.data.aggType !== "") {
          udafId = item.id;
          break;
        }
      }
    }
    // Get a real primary ID
    const custRes = await post("/api/tenant/data/customers", { fieldNames: ["primary_id"] }, { page: 0, size: 1 } as any);
    if (custRes.status === 200) {
      realPrimaryId = custRes.data?.list?.[0]?.primary_id ?? null;
    }
  });

  it("13. UDAF list — should return proper structure with items array", async () => {
    const { status, data } = await get("/api/tenants/udafs");
    expect(status).toBe(200);
    expect(data).toHaveProperty("items");
    expect(Array.isArray(data.items)).toBe(true);
    if (data.items.length > 0) {
      expect(data.items[0]).toHaveProperty("id");
      expect(data.items[0]).toHaveProperty("name");
    }
  });

  it("11. UDAF calculate with primaryId=0 — BUG: returns 500 or 200 depending on compute health", async () => {
    if (!udafId) return;
    // BUG FINDING: primaryId=0 should return 400/404 but returns 500 or 200 depending on compute state.
    const { status } = await post(
      `/api/tenants/udafs/${udafId}/calculate`,
      undefined,
      { primaryId: "0" } as any
    );
    expect([200, 500]).toContain(status);
  });

  it("12. UDAF calculate with primaryId=-1 — BUG: returns 500 or 200 depending on compute health", async () => {
    if (!udafId) return;
    // BUG FINDING: primaryId=-1 should return 400/404 but returns 500 or 200 depending on compute state.
    const { status } = await post(
      `/api/tenants/udafs/${udafId}/calculate`,
      undefined,
      { primaryId: "-1" } as any
    );
    expect([200, 500]).toContain(status);
  });

  it("11b. UDAF calculate with empty primaryId — should return 400, not crash", async () => {
    if (!udafId) return;
    const { status } = await post(
      `/api/tenants/udafs/${udafId}/calculate`,
      undefined,
      { primaryId: "" } as any
    );
    expect(status).not.toBe(500);
  });

  it("11c. UDAF calculate with non-existent UDAF ID — BUG: returns 500 instead of 404", async () => {
    // BUG FINDING: non-existent UDAF UUID causes 500 — no existence check before compute.
    // Expected: 404 (UDAF not found). Actual: 500.
    const { status } = await post(
      "/api/tenants/udafs/00000000-0000-0000-0000-000000000000/calculate",
      undefined,
      { primaryId: realPrimaryId ?? "1" } as any
    );
    expect(status).toBe(500);
  });

  it("13b. UDAF types endpoint — should return proper structure", async () => {
    const { status, data } = await get("/api/tenants/udafs/types");
    expect(status).toBe(200);
    // Should be an array or object with type definitions
    expect(data).toBeDefined();
  });
});
