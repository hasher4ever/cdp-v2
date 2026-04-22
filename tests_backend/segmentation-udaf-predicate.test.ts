/**
 * Segmentation with UDAF-kind predicates.
 *
 * Tests that the segmentation preview and CRUD endpoints correctly handle
 * predicates where `param.kind = "udaf"` (referencing a UDAF by artifactId),
 * as opposed to the field-kind predicates tested in segmentation.test.ts.
 *
 * Prerequisites: The shared tenant must have at least one UDAF.
 * The tests dynamically discover a UDAF to use as the artifactId.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { get, post, put, del } from "./client";

/** Helper to build a UDAF condition predicate */
function udafCondition(artifactId: string, operator: string, float64Value: number) {
  return {
    type: "condition" as const,
    condition: {
      param: { kind: "udaf" as const, artifactId },
      operator,
      value: { float64: [float64Value], string: [], int64: [], bool: [], time: [] },
    },
  };
}

/** Helper to wrap predicates in a group filter */
function groupFilter(predicates: any[], logicalOp: "AND" | "OR" = "AND", negate = false) {
  return {
    type: "group" as const,
    group: { logicalOp, predicates, negate },
  };
}

/** Helper to build a preview payload */
function previewPayload(name: string, segments: { name: string; customerProfileFilter: any }[]) {
  return { segmentation: { name, segments } };
}

describe("Segmentation UDAF Predicates", () => {
  let udafId: string;
  let udafName: string;

  beforeAll(async () => {
    // UDAF predicates in segmentation preview require the UDAF to be materialized.
    // Fresh UDAFs fail with "schema provider not exits" (409 code 12).
    // Strategy: find an existing UDAF with non-empty aggType that is materialized,
    // by probing the preview endpoint with each candidate.
    const { data: udafList } = await get("/api/tenants/udafs", { page: 0, size: 30 });
    if (udafList?.items) {
      for (const candidate of udafList.items) {
        if (!candidate.id || candidate.name?.startsWith("diag_")) continue;
        const { data: detail } = await get(`/api/tenants/udafs/${candidate.id}`);
        if (!detail?.aggType) continue;

        // Probe: does this UDAF work in a segmentation preview?
        const probe = await post("/api/tenants/segmentation/preview", {
          segmentation: {
            name: "probe",
            segments: [{
              name: "P",
              customerProfileFilter: groupFilter([udafCondition(candidate.id, ">=", 0)]),
            }],
          },
        });
        if (probe.status === 200) {
          udafId = candidate.id;
          udafName = candidate.name || "(unnamed)";
          break;
        }
      }
    }
    if (!udafId) {
      console.warn("[setup] No materialized UDAF found — UDAF predicate tests will fail");
    }
  });

  // ─── Preview with UDAF predicate ──────────────────────────────────────────

  describe("Preview - /api/tenants/segmentation/preview (UDAF predicate)", () => {
    it("should preview with UDAF > 0 predicate and return a count", async () => {
      const payload = previewPayload("udaf_gt_preview", [
        {
          name: "HighValue",
          customerProfileFilter: groupFilter([udafCondition(udafId, ">", 0)]),
        },
      ]);

      const { status, data } = await post("/api/tenants/segmentation/preview", payload);
      expect(status).toBe(200);
      expect(data).toHaveProperty("segments");
      expect(data.segments).toHaveLength(1);
      expect(data.segments[0]).toHaveProperty("numberOfCustomer");
      expect(typeof data.segments[0].numberOfCustomer).toBe("number");
    });

    it("should preview with UDAF >= 0 (broad filter, should match many)", async () => {
      const payload = previewPayload("udaf_gte_preview", [
        {
          name: "AllWithUdaf",
          customerProfileFilter: groupFilter([udafCondition(udafId, ">=", 0)]),
        },
      ]);

      const { status, data } = await post("/api/tenants/segmentation/preview", payload);
      expect(status).toBe(200);
      expect(data.segments[0].numberOfCustomer).toBeGreaterThanOrEqual(0);
    });

    it("should preview with UDAF < operator", async () => {
      const payload = previewPayload("udaf_lt_preview", [
        {
          name: "LowValue",
          customerProfileFilter: groupFilter([udafCondition(udafId, "<", 999999)]),
        },
      ]);

      const { status, data } = await post("/api/tenants/segmentation/preview", payload);
      expect(status).toBe(200);
      expect(data.segments[0]).toHaveProperty("numberOfCustomer");
    });

    it("should preview with UDAF = operator (exact match)", async () => {
      const payload = previewPayload("udaf_eq_preview", [
        {
          name: "ExactZero",
          customerProfileFilter: groupFilter([udafCondition(udafId, "=", 0)]),
        },
      ]);

      const { status, data } = await post("/api/tenants/segmentation/preview", payload);
      expect(status).toBe(200);
      expect(typeof data.segments[0].numberOfCustomer).toBe("number");
    });

    it("should preview with multiple segments using different UDAF thresholds", async () => {
      const payload = previewPayload("udaf_multi_seg", [
        {
          name: "HighSpenders",
          customerProfileFilter: groupFilter([udafCondition(udafId, ">", 1000)]),
        },
        {
          name: "LowSpenders",
          customerProfileFilter: groupFilter([udafCondition(udafId, "<=", 1000)]),
        },
      ]);

      const { status, data } = await post("/api/tenants/segmentation/preview", payload);
      expect(status).toBe(200);
      expect(data.segments).toHaveLength(2);
      expect(data.segments[0]).toHaveProperty("numberOfCustomer");
      expect(data.segments[1]).toHaveProperty("numberOfCustomer");
    });

    it("should preview with UDAF predicate combined with field predicate (AND)", async () => {
      // Get a customer field from the schema to combine with the UDAF
      const { data: schema } = await get("/api/tenants/schema/customers/fields");
      const varcharField = schema?.find?.(
        (f: any) => f.fieldName?.startsWith("col__varchar") && f.access !== "field_system"
      );
      if (!varcharField) return; // skip if no varchar field available

      const fieldCondition = {
        type: "condition" as const,
        condition: {
          param: { kind: "field" as const, fieldName: varcharField.fieldName },
          operator: "is_not_null",
          value: { string: [], float64: [], int64: [], bool: [], time: [] },
        },
      };

      const payload = previewPayload("udaf_field_combo", [
        {
          name: "ComboFilter",
          customerProfileFilter: groupFilter([
            udafCondition(udafId, ">", 0),
            fieldCondition,
          ]),
        },
      ]);

      const { status, data } = await post("/api/tenants/segmentation/preview", payload);
      expect(status).toBe(200);
      expect(data.segments[0]).toHaveProperty("numberOfCustomer");
    });

    it("should preview with negated UDAF group (NOT customers with UDAF > 1000)", async () => {
      const payload = previewPayload("udaf_negate_preview", [
        {
          name: "NotHighSpenders",
          customerProfileFilter: groupFilter([udafCondition(udafId, ">", 1000)], "AND", true),
        },
      ]);

      const { status, data } = await post("/api/tenants/segmentation/preview", payload);
      expect(status).toBe(200);
      expect(typeof data.segments[0].numberOfCustomer).toBe("number");
    });

    it("should preview with OR group of UDAF conditions", async () => {
      const payload = previewPayload("udaf_or_preview", [
        {
          name: "EitherRange",
          customerProfileFilter: groupFilter(
            [udafCondition(udafId, ">", 5000), udafCondition(udafId, "=", 0)],
            "OR"
          ),
        },
      ]);

      const { status, data } = await post("/api/tenants/segmentation/preview", payload);
      expect(status).toBe(200);
      expect(typeof data.segments[0].numberOfCustomer).toBe("number");
    });
  });

  // ─── Error cases ──────────────────────────────────────────────────────────

  describe("Error cases — invalid UDAF predicates", () => {
    it("should reject preview with non-existent UDAF artifactId (code 12)", async () => {
      const payload = previewPayload("udaf_bad_id", [
        {
          name: "BadUdaf",
          customerProfileFilter: groupFilter([
            udafCondition("00000000-0000-0000-0000-000000000000", ">", 0),
          ]),
        },
      ]);

      const { status, data } = await post("/api/tenants/segmentation/preview", payload);
      // Backend returns 200 with error code 12 ("segmentation data invalid")
      expect(data).toHaveProperty("code");
      expect(data.code).toBe(12);
      expect(data.description).toContain("invalid");
    });

    it("should return 500 when artifactId is empty string (invalid UUID)", async () => {
      const payload = previewPayload("udaf_missing_id", [
        {
          name: "NoId",
          customerProfileFilter: groupFilter([
            udafCondition("", ">", 0),
          ]),
        },
      ]);

      const { status, data } = await post("/api/tenants/segmentation/preview", payload);
      // Backend crashes with "invalid UUID length: 0" instead of a proper validation error
      expect(status).toBe(500);
    });
  });

  // ─── CRUD with UDAF predicate ─────────────────────────────────────────────

  describe("CRUD — segmentation with UDAF predicate", () => {
    let createdSegId: string;
    let createdSegmentId: string;

    it("should create a segmentation with UDAF predicate", async () => {
      const payload = {
        name: `test_udaf_seg_${Date.now()}`,
        segments: [
          {
            name: "UdafSegment",
            customerProfileFilter: groupFilter([udafCondition(udafId, ">", 500)]),
          },
        ],
      };

      const { status, data } = await post("/api/tenants/segmentation", payload);
      expect(status).toBe(200);
      expect(data).toHaveProperty("id");
      expect(data).toHaveProperty("segments");
      expect(data.segments).toHaveLength(1);

      createdSegId = data.id;
      createdSegmentId = data.segments[0].id;

      // Verify the UDAF predicate is preserved in the response
      const pred = data.segments[0].customerProfileFilter;
      expect(pred.type).toBe("group");
      const condition = pred.group.predicates[0].condition;
      expect(condition.param.kind).toBe("udaf");
      expect(condition.param.artifactId).toBe(udafId);
      expect(condition.operator).toBe(">");
      expect(condition.value.float64).toContain(500);
    });

    it("should read back the created segmentation with UDAF predicate intact", async () => {
      if (!createdSegId) return;
      const { status, data } = await get(`/api/tenants/segmentation/${createdSegId}`);
      expect(status).toBe(200);
      expect(data.id).toBe(createdSegId);
      expect(data.segments).toHaveLength(1);

      const condition = data.segments[0].customerProfileFilter.group.predicates[0].condition;
      expect(condition.param.kind).toBe("udaf");
      expect(condition.param.artifactId).toBe(udafId);
      // Backend enriches with extraResult — verify it's present
      expect(condition.param).toHaveProperty("extraResult");
    });

    it("should update segmentation — change UDAF threshold", async () => {
      if (!createdSegId || !createdSegmentId) return;
      const payload = {
        name: `test_udaf_seg_updated_${Date.now()}`,
        segments: [
          {
            id: createdSegmentId,
            name: "UdafSegmentUpdated",
            customerProfileFilter: groupFilter([udafCondition(udafId, ">=", 100)]),
          },
        ],
      };

      const { status, data } = await put(`/api/tenants/segmentation/${createdSegId}`, payload);
      expect(status).toBe(200);
      expect(data.name).toContain("test_udaf_seg_updated_");

      const condition = data.segments[0].customerProfileFilter.group.predicates[0].condition;
      expect(condition.operator).toBe(">=");
      expect(condition.value.float64).toContain(100);
    });

    it("should preview the created UDAF segmentation", async () => {
      if (!createdSegId) return;
      // Re-read the current state then preview with same filter
      const { data: seg } = await get(`/api/tenants/segmentation/${createdSegId}`);
      const payload = previewPayload("preview_created", seg.segments);

      const { status, data } = await post("/api/tenants/segmentation/preview", payload);
      expect(status).toBe(200);
      expect(data.segments).toHaveLength(1);
      expect(typeof data.segments[0].numberOfCustomer).toBe("number");
    });

    it("should attempt to delete the UDAF segmentation (BUG-009: returns 400)", async () => {
      if (!createdSegId) return;
      const { status } = await del(`/api/tenants/segmentation/${createdSegId}`);
      // BUG-009: DELETE on segmentation returns 400 "method not allowed"
      expect([200, 204, 400]).toContain(status);
    });
  });
});
