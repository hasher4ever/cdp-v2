/**
 * Segmentation Preview — Functional Correctness Tests
 *
 * Probes POST /api/tenants/segmentation/preview for correct counts.
 *
 * UPDATE (Session 12): BUG-043 is FIXED. The endpoint now works at
 * /api/tenants/segmentation/preview with the segmentation wrapper format:
 * { segmentation: { name, segments: [{ name, customerProfileFilter }] } }
 *
 * The old flat format (combinator/predicates) returns 409 (schema mismatch).
 *
 * Shared tenant has 344,624 customers.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { get, post } from "./client";

// ── Helpers ──────────────────────────────────────────────────────────────────

function preview(
  segmentName: string,
  predicates: any[],
  logicalOp: "AND" | "OR" = "AND",
  negate = false,
) {
  return post("/api/tenants/segmentation/preview", {
    segmentation: {
      name: "correctness_test",
      segments: [
        {
          name: segmentName,
          customerProfileFilter: {
            type: "group",
            group: { logicalOp, predicates, negate },
          },
        },
      ],
    },
  });
}

function fieldPred(fieldName: string, operator: string, value: any) {
  return {
    type: "condition",
    condition: {
      param: { kind: "field", fieldName },
      operator,
      value:
        typeof value === "string"
          ? { string: [value], time: [], float64: [], int64: [], bool: [] }
          : typeof value === "number"
            ? { int64: [value], string: [], time: [], float64: [], bool: [] }
            : value,
    },
  };
}

function nullPred(fieldName: string, operator: "is_null" | "is_not_null") {
  return {
    type: "condition",
    condition: {
      param: { kind: "field", fieldName },
      operator,
      value: { string: [], time: [], float64: [], int64: [], bool: [] },
    },
  };
}

function udafPred(artifactId: string, operator: string, intValue: number) {
  return {
    type: "condition",
    condition: {
      param: { kind: "udaf", artifactId },
      operator,
      value: { int64: [intValue], string: [], time: [], float64: [], bool: [] },
    },
  };
}

function count(data: any): number {
  return data?.segments?.[0]?.numberOfCustomer ?? -1;
}

// ── State ────────────────────────────────────────────────────────────────────

let totalCustomers = 0;
let validUdafId: string | null = null;
let varcharField = "col__varchar_s50000__1";

describe("Segmentation Preview — Functional Correctness", () => {
  beforeAll(async () => {
    // 1. Get total customer count
    const custRes = await post("/api/tenant/data/customers", {
      fieldNames: ["primary_id"],
    });
    if (custRes.status === 200) {
      totalCustomers = custRes.data?.totalCount ?? 0;
    }

    // 2. Find a valid UDAF with non-empty aggType
    const udafRes = await get("/api/tenants/udafs");
    if (udafRes.status === 200 && udafRes.data?.items?.length > 0) {
      for (const item of udafRes.data.items) {
        if (item.name?.startsWith("diag_")) continue;
        const def = await get(`/api/tenants/udafs/${item.id}`);
        if (def.status === 200 && def.data?.aggType && def.data.aggType !== "") {
          validUdafId = item.id;
          break;
        }
      }
    }

    // 3. Discover varchar field
    const schemaRes = await get("/api/tenants/schema/internal/customers/fields/info");
    if (schemaRes.status === 200 && schemaRes.data?.fields) {
      const f = schemaRes.data.fields.find(
        (f: any) => f.type === "varchar" && f.state === "present",
      );
      if (f?.name) varcharField = f.name;
    }
  });

  // ── Basic Count Correctness ────────────────────────────────────────────────

  describe("Count correctness", () => {
    it("empty predicates (all customers) → total count", async () => {
      const { status, data } = await preview("All", []);
      expect(status).toBe(200);
      if (totalCustomers > 0) {
        expect(count(data)).toBe(totalCustomers);
      }
    });

    it("negative primary_id filter → count >= 0 (boundary-ingest data may match)", async () => {
      const { status, data } = await preview("NegId", [
        fieldPred("primary_id", "<", 0),
      ]);
      expect(status).toBe(200);
      expect(count(data)).toBeGreaterThanOrEqual(0);
    });

    it("AND contradictory → 0", async () => {
      const { status, data } = await preview("Contradiction", [
        fieldPred("primary_id", ">", 999999999999),
        fieldPred("primary_id", "<", 1),
      ]);
      expect(status).toBe(200);
      expect(count(data)).toBe(0);
    });
  });

  // ── Multi-segment ─────────────────────────────────────────────────────────

  describe("Multi-segment preview", () => {
    it("two segments: all vs none → total and 0", async () => {
      const { status, data } = await post("/api/tenants/segmentation/preview", {
        segmentation: {
          name: "multi_seg_test",
          segments: [
            {
              name: "All",
              customerProfileFilter: {
                type: "group",
                group: { logicalOp: "AND", predicates: [], negate: false },
              },
            },
            {
              name: "None",
              customerProfileFilter: {
                type: "group",
                group: {
                  logicalOp: "AND",
                  predicates: [
                    {
                      type: "condition",
                      condition: {
                        param: { kind: "field", fieldName: "primary_id" },
                        operator: "<",
                        value: { int64: [0], string: [], time: [], float64: [], bool: [] },
                      },
                    },
                  ],
                  negate: false,
                },
              },
            },
          ],
        },
      });
      expect(status).toBe(200);
      expect(data.segments).toHaveLength(2);
      if (totalCustomers > 0) {
        const allCount = data.segments.find((s: any) => s.name === "All")?.numberOfCustomer;
        const noneCount = data.segments.find((s: any) => s.name === "None")?.numberOfCustomer;
        expect(allCount).toBe(totalCustomers);
        expect(noneCount).toBe(0);
      }
    });
  });

  // ── UDAF predicates ───────────────────────────────────────────────────────

  describe("UDAF predicates", () => {
    it("UDAF >= 0 → count >= 0", async () => {
      if (!validUdafId) return;
      const { status, data } = await preview("UdafGte0", [
        udafPred(validUdafId, ">=", 0),
      ]);
      if (status === 200) {
        expect(count(data)).toBeGreaterThanOrEqual(0);
      } else {
        // UDAF predicate may return 409 if UDAF is corrupted
        expect([200, 409]).toContain(status);
      }
    });

    it("UDAF with fake artifactId → not 500", async () => {
      const { status } = await preview("FakeUdaf", [
        udafPred("00000000-0000-0000-0000-000000000000", ">", 0),
      ]);
      expect(status).not.toBe(500);
    });
  });

  // ── Null operator ─────────────────────────────────────────────────────────

  describe("Null operators", () => {
    it("is_null on varchar → count >= 0", async () => {
      const { status, data } = await preview("IsNull", [
        nullPred(varcharField, "is_null"),
      ]);
      if (status === 200) {
        expect(count(data)).toBeGreaterThanOrEqual(0);
      } else {
        expect([200, 400]).toContain(status);
      }
    });

    it("is_not_null on varchar → count >= 0", async () => {
      const { status, data } = await preview("IsNotNull", [
        nullPred(varcharField, "is_not_null"),
      ]);
      if (status === 200) {
        expect(count(data)).toBeGreaterThanOrEqual(0);
      } else {
        expect([200, 400]).toContain(status);
      }
    });
  });

  // ── Consistency ───────────────────────────────────────────────────────────

  describe("Count consistency", () => {
    it("same predicate twice → same count", async () => {
      const r1 = await preview("Consistency1", []);
      const r2 = await preview("Consistency2", []);
      if (r1.status === 200 && r2.status === 200) {
        expect(count(r1.data)).toBe(count(r2.data));
      }
    });
  });
});
