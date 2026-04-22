/**
 * Segmentation tests for EVERY field type and operator combination.
 * Uses shared dataset from globalSetup scoped by primary_id IN [...].
 *
 * Operators: =, !=, >, <, >=, <=, in, is null, is not null
 * Field types: VARCHAR, BIGINT, DOUBLE, BOOL
 */
import { describe, it, expect } from "vitest";
import { post } from "../tests_backend/client";
import { custField, getTenant } from "./tenant-context";
import { primaryIdScopePredicate } from "./test-factories";

const t = getTenant();
const { customers, runTag: TAG } = t;
const ourIds = customers.map(c => c.primary_id);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cond(fieldName: string, operator: string, value: {
  string?: string[]; float64?: number[]; int64?: number[];
  bool?: boolean[]; time?: string[];
}) {
  return {
    type: "condition" as const,
    condition: {
      param: { kind: "field" as const, fieldName },
      operator,
      value: {
        string: value.string ?? [], time: value.time ?? [],
        float64: value.float64 ?? [], int64: value.int64 ?? [],
        bool: value.bool ?? [],
      },
    },
  };
}

/** Scoped preview: wraps test predicates in AND with id scope */
function scopedPreview(name: string, testPredicates: any[]) {
  return post("/api/tenants/segmentation/preview", {
    segmentation: {
      name,
      segments: [{
        name: "S",
        customerProfileFilter: {
          type: "group",
          group: {
            logicalOp: "AND",
            negate: false,
            predicates: [primaryIdScopePredicate(ourIds), ...testPredicates],
          },
        },
      }],
    },
  });
}

function count(data: any): number {
  return data.segments[0].numberOfCustomer;
}

// ─── VARCHAR: gender ──────────────────────────────────────────────────────────

describe("Segmentation: VARCHAR operators (gender)", () => {
  const f = () => custField("gender");
  const expectedFemale = customers.filter(c => c.gender === "female").length;
  const expectedNonFemale = customers.filter(c => c.gender !== "female").length;

  it(`= "female" → ${expectedFemale}`, async () => {
    const { data } = await scopedPreview(`${TAG}_vc_eq`, [cond(f(), "=", { string: ["female"] })]);
    expect(count(data)).toBe(expectedFemale);
  });

  it(`!= "female" → non-female count`, async () => {
    const { data } = await scopedPreview(`${TAG}_vc_neq`, [cond(f(), "!=", { string: ["female"] })]);
    expect(count(data)).toBe(expectedNonFemale);
  });

  it('"in" ["male","other"] → male+other count', async () => {
    const expected = customers.filter(c => c.gender === "male" || c.gender === "other").length;
    const { data } = await scopedPreview(`${TAG}_vc_in`, [cond(f(), "in", { string: ["male", "other"] })]);
    expect(count(data)).toBe(expected);
  });

  it('"is not null" → all (everyone has gender)', async () => {
    const { data } = await scopedPreview(`${TAG}_vc_nn`, [cond(f(), "is not null", {})]);
    expect(count(data)).toBe(customers.length);
  });
});

// ─── BOOL: is_adult ───────────────────────────────────────────────────────────

describe("Segmentation: BOOL operators (is_adult)", () => {
  const f = () => custField("is_adult");

  it("= true → adults", async () => {
    const expected = customers.filter(c => c.is_adult).length;
    const { data } = await scopedPreview(`${TAG}_bl_t`, [cond(f(), "=", { bool: [true] })]);
    expect(count(data)).toBe(expected);
  });

  it("= false → minors", async () => {
    const expected = customers.filter(c => !c.is_adult).length;
    const { data } = await scopedPreview(`${TAG}_bl_f`, [cond(f(), "=", { bool: [false] })]);
    expect(count(data)).toBe(expected);
  });
});

// ─── DOUBLE: income ───────────────────────────────────────────────────────────

describe("Segmentation: DOUBLE operators (income)", () => {
  const f = () => custField("income");

  it("> 100000 → high-income count", async () => {
    const expected = customers.filter(c => c.income > 100000).length;
    const { data } = await scopedPreview(`${TAG}_dbl_gt`, [cond(f(), ">", { float64: [100000] })]);
    expect(count(data)).toBe(expected);
  });

  it("< 50000 → low-income count", async () => {
    const expected = customers.filter(c => c.income < 50000).length;
    const { data } = await scopedPreview(`${TAG}_dbl_lt`, [cond(f(), "<", { float64: [50000] })]);
    expect(count(data)).toBe(expected);
  });

  it(">= 75000 → at-or-above threshold", async () => {
    const expected = customers.filter(c => c.income >= 75000).length;
    const { data } = await scopedPreview(`${TAG}_dbl_gte`, [cond(f(), ">=", { float64: [75000] })]);
    expect(count(data)).toBe(expected);
  });

  it("<= 0 → zero-income count", async () => {
    const expected = customers.filter(c => c.income <= 0).length;
    const { data } = await scopedPreview(`${TAG}_dbl_lte0`, [cond(f(), "<=", { float64: [0] })]);
    expect(count(data)).toBe(expected);
  });

  it("= 0 → exactly zero", async () => {
    const expected = customers.filter(c => c.income === 0).length;
    const { data } = await scopedPreview(`${TAG}_dbl_eq0`, [cond(f(), "=", { float64: [0] })]);
    expect(count(data)).toBe(expected);
  });
});

// ─── BIGINT: age ──────────────────────────────────────────────────────────────

describe("Segmentation: BIGINT operators (age)", () => {
  const f = () => custField("age");

  it("> 50 → senior count", async () => {
    const expected = customers.filter(c => c.age > 50).length;
    const { data } = await scopedPreview(`${TAG}_int_gt50`, [cond(f(), ">", { int64: [50] })]);
    expect(count(data)).toBe(expected);
  });

  it("< 18 → minor count", async () => {
    const expected = customers.filter(c => c.age < 18).length;
    const { data } = await scopedPreview(`${TAG}_int_lt18`, [cond(f(), "<", { int64: [18] })]);
    expect(count(data)).toBe(expected);
  });

  it(">= 25 AND <= 35 → mid-range age count", async () => {
    const expected = customers.filter(c => c.age >= 25 && c.age <= 35).length;
    const { data } = await scopedPreview(`${TAG}_int_range`, [
      cond(f(), ">=", { int64: [25] }),
      cond(f(), "<=", { int64: [35] }),
    ]);
    expect(count(data)).toBe(expected);
  });

  it("= 30 → exact match count", async () => {
    const expected = customers.filter(c => c.age === 30).length;
    const { data } = await scopedPreview(`${TAG}_int_eq30`, [cond(f(), "=", { int64: [30] })]);
    expect(count(data)).toBe(expected);
  });
});
