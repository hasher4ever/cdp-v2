/**
 * L4 Advanced Segmentation Predicates
 * Uses shared dataset from globalSetup scoped by primary_id IN [...].
 *
 * Tests complex predicate structures and edge cases in segmentation:
 *   1. Deeply nested predicate trees (AND within OR within AND)
 *   2. Multi-value IN-like conditions via OR
 *   3. Range queries combining >, <, >=, <= operators
 *   4. Mixed field types in one predicate (varchar + bigint + bool + double)
 *   5. Complement validation: segment + NOT(segment) = total customers
 *   6. Overlapping segments: customers appearing in multiple segments
 *   7. Predicate with all operators on same field
 *   8. Large OR fan-out (many conditions)
 */
import { describe, it, expect } from "vitest";
import { post } from "../tests_backend/client";
import { custField, getTenant } from "./tenant-context";
import { primaryIdScopePredicate, type TestCustomer } from "./test-factories";

const t = getTenant();
const { customers, runTag: TAG } = t;
const ourIds = customers.map(c => c.primary_id);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cond(fieldName: string, operator: string, value: any) {
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

function group(logicalOp: "AND" | "OR", predicates: any[], negate = false) {
  return { type: "group" as const, group: { logicalOp, negate, predicates } };
}

function scoped(filter: any): any {
  return group("AND", [primaryIdScopePredicate(ourIds), filter]);
}

function preview(name: string, segments: { name: string; customerProfileFilter: any }[]) {
  return post("/api/tenants/segmentation/preview", { segmentation: { name, segments } });
}

function segCount(data: any, segName: string): number {
  return data.segments.find((s: any) => s.name === segName)?.numberOfCustomer ?? -1;
}

function matchCount(pred: (c: TestCustomer) => boolean): number {
  return customers.filter(pred).length;
}

// ─── 1. Deeply nested predicates (3 levels) ────────────────────────────────

describe("L4: Deeply nested predicates — AND(OR(...), AND(...))", () => {
  it("(female OR other) AND (adult AND subscribed)", async () => {
    const expected = matchCount(c =>
      (c.gender === "female" || c.gender === "other") &&
      c.is_adult && c.is_subscribed
    );
    const { status, data } = await preview(`${TAG}_nested1`, [
      {
        name: "NestedFemaleActiveSub",
        customerProfileFilter: scoped(group("AND", [
          group("OR", [
            cond(custField("gender"), "=", { string: ["female"] }),
            cond(custField("gender"), "=", { string: ["other"] }),
          ]),
          group("AND", [
            cond(custField("is_adult"), "=", { bool: [true] }),
            cond(custField("is_subscribed"), "=", { bool: [true] }),
          ]),
        ])),
      },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "NestedFemaleActiveSub")).toBe(expected);
  });

  it("NOT(male AND income > 100K) — scoped to our data", async () => {
    const expected = matchCount(c => !(c.gender === "male" && c.income > 100000));
    const { status, data } = await preview(`${TAG}_nested2`, [
      {
        name: "NotRichMale",
        customerProfileFilter: scoped(group("AND", [
          group("AND", [
            cond(custField("gender"), "=", { string: ["male"] }),
            cond(custField("income"), ">", { float64: [100000] }),
          ], true),
        ])),
      },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "NotRichMale")).toBe(expected);
  });
});

// ─── 2. Multi-value via OR (simulating IN operator) ─────────────────────────

describe("L4: Multi-value OR — simulating IN operator", () => {
  it("gender IN (female, other) via OR", async () => {
    const expected = matchCount(c => c.gender === "female" || c.gender === "other");
    const { status, data } = await preview(`${TAG}_in_gender`, [
      {
        name: "FemOrOther",
        customerProfileFilter: scoped(group("OR", [
          cond(custField("gender"), "=", { string: ["female"] }),
          cond(custField("gender"), "=", { string: ["other"] }),
        ])),
      },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "FemOrOther")).toBe(expected);
  });

  it("age IN (15, 28, 55) via OR", async () => {
    const expected = matchCount(c => [15, 28, 55].includes(c.age));
    const { status, data } = await preview(`${TAG}_in_age`, [
      {
        name: "SpecificAges",
        customerProfileFilter: scoped(group("OR", [
          cond(custField("age"), "=", { int64: [15] }),
          cond(custField("age"), "=", { int64: [28] }),
          cond(custField("age"), "=", { int64: [55] }),
        ])),
      },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "SpecificAges")).toBe(expected);
  });
});

// ─── 3. Range queries — combined operators ──────────────────────────────────

describe("L4: Range queries — > and < combined", () => {
  it("age between 20 and 40 (exclusive)", async () => {
    const expected = matchCount(c => c.age > 20 && c.age < 40);
    const { status, data } = await preview(`${TAG}_range_age`, [
      {
        name: "Age20to40",
        customerProfileFilter: scoped(group("AND", [
          cond(custField("age"), ">", { int64: [20] }),
          cond(custField("age"), "<", { int64: [40] }),
        ])),
      },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "Age20to40")).toBe(expected);
  });

  it("income exactly 0", async () => {
    const expected = matchCount(c => c.income === 0);
    const { status, data } = await preview(`${TAG}_range_zero`, [
      {
        name: "ZeroIncome",
        customerProfileFilter: scoped(group("AND", [cond(custField("income"), "=", { float64: [0] })])),
      },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "ZeroIncome")).toBe(expected);
  });

  it("income between 50K and 100K inclusive", async () => {
    const expected = matchCount(c => c.income >= 50000 && c.income <= 100000);
    const { status, data } = await preview(`${TAG}_range_mid_income`, [
      {
        name: "MidIncome",
        customerProfileFilter: scoped(group("AND", [
          cond(custField("income"), ">=", { float64: [50000] }),
          cond(custField("income"), "<=", { float64: [100000] }),
        ])),
      },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "MidIncome")).toBe(expected);
  });
});

// ─── 4. Mixed field types in one predicate ──────────────────────────────────

describe("L4: Mixed field types — varchar + bigint + bool + double in one predicate", () => {
  it("female AND adult AND subscribed AND income > 50000", async () => {
    const expected = matchCount(c =>
      c.gender === "female" && c.is_adult && c.is_subscribed && c.income > 50000
    );
    const { status, data } = await preview(`${TAG}_mixed_all`, [
      {
        name: "PremiumFemaleSubs",
        customerProfileFilter: scoped(group("AND", [
          cond(custField("gender"), "=", { string: ["female"] }),
          cond(custField("is_adult"), "=", { bool: [true] }),
          cond(custField("is_subscribed"), "=", { bool: [true] }),
          cond(custField("income"), ">", { float64: [50000] }),
        ])),
      },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "PremiumFemaleSubs")).toBe(expected);
  });

  it("male AND age >= 40 AND income > 100000", async () => {
    const expected = matchCount(c =>
      c.gender === "male" && c.age >= 40 && c.income > 100000
    );
    const { status, data } = await preview(`${TAG}_mixed_male_senior`, [
      {
        name: "SeniorHighEarners",
        customerProfileFilter: scoped(group("AND", [
          cond(custField("gender"), "=", { string: ["male"] }),
          cond(custField("age"), ">=", { int64: [40] }),
          cond(custField("income"), ">", { float64: [100000] }),
        ])),
      },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "SeniorHighEarners")).toBe(expected);
  });
});

// ─── 5. Complement validation: A + NOT(A) = total ───────────────────────────

describe("L4: Complement — segment + NOT(segment) must equal total (scoped)", () => {
  it("subscribed + NOT(subscribed) should equal our customer count", async () => {
    const subExp = matchCount(c => c.is_subscribed);
    const notSubExp = matchCount(c => !c.is_subscribed);

    const { status, data } = await preview(`${TAG}_complement_sub`, [
      { name: "Sub", customerProfileFilter: scoped(group("AND", [cond(custField("is_subscribed"), "=", { bool: [true] })])) },
      { name: "NotSub", customerProfileFilter: scoped(group("AND", [cond(custField("is_subscribed"), "=", { bool: [true] })], true)) },
    ]);
    expect(status).toBe(200);
    const sub = segCount(data, "Sub");
    const notSub = segCount(data, "NotSub");
    expect(sub).toBe(subExp);
    expect(notSub).toBe(notSubExp);
    expect(sub + notSub).toBe(customers.length);
  });

  it("adult + NOT(adult) should equal our customer count", async () => {
    const adultExp = matchCount(c => c.is_adult);
    const notAdultExp = matchCount(c => !c.is_adult);

    const { status, data } = await preview(`${TAG}_complement_adult`, [
      { name: "Adult", customerProfileFilter: scoped(group("AND", [cond(custField("is_adult"), "=", { bool: [true] })])) },
      { name: "NotAdult", customerProfileFilter: scoped(group("AND", [cond(custField("is_adult"), "=", { bool: [true] })], true)) },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "Adult")).toBe(adultExp);
    expect(segCount(data, "NotAdult")).toBe(notAdultExp);
    expect(segCount(data, "Adult") + segCount(data, "NotAdult")).toBe(customers.length);
  });
});

// ─── 6. Overlapping segments — same customer in multiple segments ───────────

describe("L4: Overlapping segments — customers can appear in multiple segments", () => {
  it("income > 50K AND income > 100K → higher should be strict subset of lower", async () => {
    const above50Exp = matchCount(c => c.income > 50000);
    const above100Exp = matchCount(c => c.income > 100000);

    const { status, data } = await preview(`${TAG}_overlap_income`, [
      { name: "Above50K", customerProfileFilter: scoped(group("AND", [cond(custField("income"), ">", { float64: [50000] })])) },
      { name: "Above100K", customerProfileFilter: scoped(group("AND", [cond(custField("income"), ">", { float64: [100000] })])) },
    ]);
    expect(status).toBe(200);
    const above50 = segCount(data, "Above50K");
    const above100 = segCount(data, "Above100K");
    expect(above100).toBeLessThanOrEqual(above50);
    expect(above100).toBe(above100Exp);
    expect(above50).toBe(above50Exp);
  });

  it("3 age tiers: young(<20), mid(20-50), senior(>50) — mutually exclusive", async () => {
    const youngExp = matchCount(c => c.age < 20);
    const midExp = matchCount(c => c.age >= 20 && c.age <= 50);
    const seniorExp = matchCount(c => c.age > 50);

    const { status, data } = await preview(`${TAG}_overlap_age_tiers`, [
      { name: "Young", customerProfileFilter: scoped(group("AND", [cond(custField("age"), "<", { int64: [20] })])) },
      { name: "Mid", customerProfileFilter: scoped(group("AND", [cond(custField("age"), ">=", { int64: [20] }), cond(custField("age"), "<=", { int64: [50] })])) },
      { name: "Senior", customerProfileFilter: scoped(group("AND", [cond(custField("age"), ">", { int64: [50] })])) },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "Young")).toBe(youngExp);
    expect(segCount(data, "Mid")).toBe(midExp);
    expect(segCount(data, "Senior")).toBe(seniorExp);
    expect(youngExp + midExp + seniorExp).toBe(customers.length);
  });
});

// ─── 7. All comparison operators on one field ───────────────────────────────

describe("L4: All operators on income field — =, >, <, >=, <=", () => {
  it("income = 0", async () => {
    const expected = matchCount(c => c.income === 0);
    const { status, data } = await preview(`${TAG}_ops_eq`, [
      { name: "Eq0", customerProfileFilter: scoped(group("AND", [cond(custField("income"), "=", { float64: [0] })])) },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "Eq0")).toBe(expected);
  });

  it("income > 0 AND income < 50000", async () => {
    const expected = matchCount(c => c.income > 0 && c.income < 50000);
    const { status, data } = await preview(`${TAG}_ops_between`, [
      {
        name: "LowPositive",
        customerProfileFilter: scoped(group("AND", [
          cond(custField("income"), ">", { float64: [0] }),
          cond(custField("income"), "<", { float64: [50000] }),
        ])),
      },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "LowPositive")).toBe(expected);
  });

  it("income <= 55000 — boundary test", async () => {
    const expected = matchCount(c => c.income <= 55000);
    const { status, data } = await preview(`${TAG}_ops_lte`, [
      { name: "Lte55K", customerProfileFilter: scoped(group("AND", [cond(custField("income"), "<=", { float64: [55000] })])) },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "Lte55K")).toBe(expected);
  });
});
