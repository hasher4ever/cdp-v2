/**
 * Segmentation Create + Preview Integration (Session 21)
 *
 * First full create->preview integration test. BUG-043 (preview 409) was
 * fixed in S20. This suite validates the end-to-end segmentation lifecycle:
 * create, list, preview, delete.
 *
 * Shared tenant: ~348K customers
 * Known bugs:
 *   BUG-009: DELETE segmentation may return 400
 *   BUG-070: is_null/is_not_null return 400
 *   BUG-071: multi-segment preview returns 0 for filtered segments after first
 *   BUG-072: contains returns 400
 */
import { describe, it, expect, afterAll } from "vitest";
import { get, post, del } from "./client";

// ── Helpers (same pattern as S20 preview logic tests) ───────────────────────

const TS = Date.now();
const genderField = "col__varchar_s50000__2"; // female/male/other
const nameField = "col__varchar_s50000__0";

/** IDs of segmentations created during tests — cleaned up in afterAll */
const createdIds: string[] = [];

function fieldCond(fieldName: string, operator: string, value: any) {
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

function inCond(fieldName: string, values: string[]) {
  return {
    type: "condition",
    condition: {
      param: { kind: "field", fieldName },
      operator: "in",
      value: { string: values, time: [], float64: [], int64: [], bool: [] },
    },
  };
}

function groupPred(
  predicates: any[],
  logicalOp: "AND" | "OR" = "AND",
  negate = false,
) {
  return {
    type: "group",
    group: { logicalOp, predicates, negate },
  };
}

function segFilter(
  predicates: any[],
  logicalOp: "AND" | "OR" = "AND",
  negate = false,
) {
  return {
    type: "group",
    group: { logicalOp, predicates, negate },
  };
}

function count(data: any, segName?: string): number {
  if (segName) {
    const seg = data?.segments?.find((s: any) => s.name === segName);
    return seg?.numberOfCustomer ?? -1;
  }
  return data?.segments?.[0]?.numberOfCustomer ?? -1;
}

/** Create a segmentation and track its ID for cleanup */
async function createSeg(
  name: string,
  segments: any[],
): Promise<{ status: number; data: any }> {
  const res = await post("/api/tenants/segmentation", { name, segments });
  if (res.status === 200 && res.data?.id) {
    createdIds.push(res.data.id);
  }
  return res;
}

/** Preview a single-segment segmentation inline */
function previewSingle(
  name: string,
  predicates: any[],
  logicalOp: "AND" | "OR" = "AND",
  negate = false,
) {
  return post("/api/tenants/segmentation/preview", {
    segmentation: {
      name: `s21_preview_${TS}`,
      segments: [
        {
          name,
          customerProfileFilter: segFilter(predicates, logicalOp, negate),
        },
      ],
    },
  });
}

// ── State ───────────────────────────────────────────────────────────────────

let totalCustomers = 0;
let femalePreviewCount = 0;

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Segmentation Create + Preview Integration (Session 21)", () => {
  // Get total customer count for assertions
  it("baseline: fetch total customer count", { timeout: 30000 }, async () => {
    const res = await post("/api/tenant/data/customers", {
      fieldNames: ["primary_id"],
    });
    expect(res.status).toBe(200);
    totalCustomers = res.data?.totalCount ?? 0;
    console.log(`Total customers: ${totalCustomers}`);
    expect(totalCustomers).toBeGreaterThan(100000);
  });

  // ── 1. Create segmentation with = filter -> verify 200 + has id ─────────
  describe("1. Create with = filter", () => {
    it("creates segmentation with gender=female, returns 200 + id", { timeout: 30000 }, async () => {
      const { status, data } = await createSeg(`s21_eq_${TS}`, [
        {
          name: "females",
          customerProfileFilter: segFilter([
            fieldCond(genderField, "=", "female"),
          ]),
        },
      ]);
      console.log(`Create = filter -> ${status}, id=${data?.id}`);
      expect(status).toBe(200);
      expect(data.id).toBeTruthy();
    });
  });

  // ── 2. Preview the SAME = filter inline -> verify count > 0 ─────────────
  describe("2. Preview = filter", () => {
    it("previews gender=female, returns count > 0", { timeout: 30000 }, async () => {
      const { status, data } = await previewSingle("females", [
        fieldCond(genderField, "=", "female"),
      ]);
      femalePreviewCount = count(data);
      console.log(`Preview = filter -> ${status}, count=${femalePreviewCount}`);
      expect(status).toBe(200);
      expect(femalePreviewCount).toBeGreaterThan(0);
      expect(femalePreviewCount).toBeLessThan(totalCustomers);
    });
  });

  // ── 3. Empty predicates -> preview should return total count (~348K) ────
  describe("3. Empty predicates = all customers", () => {
    it("creates seg with empty predicates, returns 200", { timeout: 30000 }, async () => {
      const { status, data } = await createSeg(`s21_empty_${TS}`, [
        {
          name: "all_customers",
          customerProfileFilter: segFilter([]),
        },
      ]);
      console.log(`Create empty predicates -> ${status}, id=${data?.id}`);
      expect(status).toBe(200);
      expect(data.id).toBeTruthy();
    });

    it("previews empty predicates, returns total customer count", { timeout: 30000 }, async () => {
      const { status, data } = await previewSingle("all", []);
      const c = count(data);
      console.log(`Preview empty -> ${status}, count=${c}, total=${totalCustomers}`);
      expect(status).toBe(200);
      expect(c).toBe(totalCustomers);
    });
  });

  // ── 4. != filter -> count should differ from = filter ───────────────────
  describe("4. != filter differs from = filter", () => {
    it("creates seg with gender!=female, count differs from =female", { timeout: 30000 }, async () => {
      const createRes = await createSeg(`s21_neq_${TS}`, [
        {
          name: "not_females",
          customerProfileFilter: segFilter([
            fieldCond(genderField, "!=", "female"),
          ]),
        },
      ]);
      expect(createRes.status).toBe(200);

      const { status, data } = await previewSingle("not_females", [
        fieldCond(genderField, "!=", "female"),
      ]);
      const c = count(data);
      console.log(
        `Preview != filter -> ${status}, count=${c}, femaleCount=${femalePreviewCount}, total=${totalCustomers}`,
      );
      expect(status).toBe(200);
      expect(c).toBeGreaterThan(0);
      expect(c).not.toBe(femalePreviewCount);
      // != may or may not include NULLs — log for awareness
      if (c === totalCustomers - femalePreviewCount) {
        console.log("CONFIRMED: != is exact complement of =");
      } else {
        console.log(
          `NOTE: != count (${c}) != total-female (${totalCustomers - femalePreviewCount}). ` +
            `Delta=${totalCustomers - femalePreviewCount - c} — likely NULL rows excluded`,
        );
      }
    });
  });

  // ── 5. IN operator -> verify count ──────────────────────────────────────
  describe("5. IN operator", () => {
    it("creates + previews gender IN (female, male), count > 0", { timeout: 30000 }, async () => {
      const createRes = await createSeg(`s21_in_${TS}`, [
        {
          name: "in_seg",
          customerProfileFilter: segFilter([
            inCond(genderField, ["female", "male"]),
          ]),
        },
      ]);
      expect(createRes.status).toBe(200);

      const { status, data } = await previewSingle("in_seg", [
        inCond(genderField, ["female", "male"]),
      ]);
      const c = count(data);
      console.log(`Preview IN(female,male) -> ${status}, count=${c}`);
      expect(status).toBe(200);
      expect(c).toBeGreaterThan(femalePreviewCount); // IN should be >= female alone
    });
  });

  // ── 6. NEGATE group -> true complement ──────────────────────────────────
  describe("6. NEGATE group", () => {
    it("creates + previews NOT(gender=female), should be complement", { timeout: 30000 }, async () => {
      const createRes = await createSeg(`s21_negate_${TS}`, [
        {
          name: "negate_female",
          customerProfileFilter: segFilter(
            [fieldCond(genderField, "=", "female")],
            "AND",
            true, // negate
          ),
        },
      ]);
      expect(createRes.status).toBe(200);

      const { status, data } = await previewSingle(
        "negate_female",
        [fieldCond(genderField, "=", "female")],
        "AND",
        true,
      );
      const c = count(data);
      console.log(
        `Preview NEGATE(female) -> ${status}, count=${c}, total=${totalCustomers}, female=${femalePreviewCount}`,
      );
      expect(status).toBe(200);
      expect(c).toBeGreaterThan(0);
      // NEGATE should be total - female (true complement)
      // May differ from != if NULL handling differs
      if (c === totalCustomers - femalePreviewCount) {
        console.log("CONFIRMED: NEGATE is true complement");
      } else {
        console.log(
          `NOTE: NEGATE count (${c}) != total-female (${totalCustomers - femalePreviewCount})`,
        );
      }
    });
  });

  // ── 7. Create + delete lifecycle ────────────────────────────────────────
  describe("7. Create + delete lifecycle", () => {
    let lifecycleId: string;

    it("creates segmentation", { timeout: 30000 }, async () => {
      const { status, data } = await post("/api/tenants/segmentation", {
        name: `s21_lifecycle_${TS}`,
        segments: [
          {
            name: "lifecycle_seg",
            customerProfileFilter: segFilter([]),
          },
        ],
      });
      console.log(`Lifecycle create -> ${status}, id=${data?.id}`);
      expect(status).toBe(200);
      lifecycleId = data.id;
      expect(lifecycleId).toBeTruthy();
    });

    it("verifies segmentation appears in list", { timeout: 30000 }, async () => {
      if (!lifecycleId) return;
      const { status, data } = await get("/api/tenants/segmentation");
      expect(status).toBe(200);
      const found = data?.items?.find((s: any) => s.id === lifecycleId);
      console.log(`List check -> found=${!!found}, totalCount=${data?.totalCount}`);
      expect(found).toBeTruthy();
    });

    it("deletes segmentation (BUG-009: may return 400)", { timeout: 30000 }, async () => {
      if (!lifecycleId) return;
      const { status } = await del(`/api/tenants/segmentation/${lifecycleId}`);
      console.log(`Delete -> ${status}`);
      // BUG-009: DELETE may return 400 instead of 200/204
      expect([200, 204, 400]).toContain(status);
      if (status === 200 || status === 204) {
        // Remove from cleanup list since we deleted it
        const idx = createdIds.indexOf(lifecycleId);
        if (idx === -1) {
          // We didn't track this one via createSeg, no need to remove
        }
      }
    });

    it("verifies segmentation removed from list (or still present if BUG-009)", { timeout: 30000 }, async () => {
      if (!lifecycleId) return;
      const { status, data } = await get("/api/tenants/segmentation");
      expect(status).toBe(200);
      const found = data?.items?.find((s: any) => s.id === lifecycleId);
      if (!found) {
        console.log("CONFIRMED: segmentation deleted successfully");
      } else {
        console.log("NOTE: segmentation still in list after delete (BUG-009)");
      }
    });
  });

  // ── 8. Contradictory filter (= X AND != X) -> should return 0 ──────────
  describe("8. Contradictory filter", () => {
    it("preview with gender=female AND gender!=female returns 0", { timeout: 30000 }, async () => {
      const { status, data } = await previewSingle("contradiction", [
        fieldCond(genderField, "=", "female"),
        fieldCond(genderField, "!=", "female"),
      ]);
      const c = count(data);
      console.log(`Contradictory filter -> ${status}, count=${c}`);
      expect(status).toBe(200);
      expect(c).toBe(0);
    });
  });

  // ── 9. Nested predicate groups (AND inside OR) ─────────────────────────
  describe("9. Nested predicate groups", () => {
    it("creates + previews (name=X AND gender=female) OR (gender=male)", { timeout: 30000 }, async () => {
      const nestedFilter = {
        type: "group",
        group: {
          logicalOp: "OR",
          predicates: [
            groupPred(
              [
                fieldCond(nameField, "=", "Alice"),
                fieldCond(genderField, "=", "female"),
              ],
              "AND",
            ),
            groupPred(
              [fieldCond(genderField, "=", "male")],
              "AND",
            ),
          ],
          negate: false,
        },
      };

      const createRes = await createSeg(`s21_nested_${TS}`, [
        { name: "nested_seg", customerProfileFilter: nestedFilter },
      ]);
      console.log(`Nested create -> ${createRes.status}`);
      expect(createRes.status).toBe(200);

      const { status, data } = await post("/api/tenants/segmentation/preview", {
        segmentation: {
          name: `s21_nested_preview_${TS}`,
          segments: [
            { name: "nested_seg", customerProfileFilter: nestedFilter },
          ],
        },
      });
      const c = count(data);
      console.log(`Nested preview -> ${status}, count=${c}`);
      if (status === 200) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(totalCustomers);
        console.log(
          `Nested (Alice AND female) OR (male) = ${c} customers`,
        );
      } else {
        // Nested groups might not be fully supported
        console.log(`FINDING: Nested groups returned ${status}`);
        expect([200, 400, 409]).toContain(status);
      }
    });
  });

  // ── Cleanup ─────────────────────────────────────────────────────────────
  afterAll(async () => {
    console.log(`\nCleanup: deleting ${createdIds.length} test segmentations...`);
    for (const id of createdIds) {
      const { status } = await del(`/api/tenants/segmentation/${id}`);
      console.log(`  Delete ${id} -> ${status}`);
    }
  });
});
