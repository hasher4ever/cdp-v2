/**
 * Complex segmentation tests — nested groups, mixed AND/OR, NEGATE, multi-segment.
 * Uses shared dataset from globalSetup scoped by primary_id IN [...].
 *
 * Tests the full predicate tree depth as shown in the UI:
 *   Group (AND/OR/NOT)
 *     ├── Condition
 *     ├── Condition
 *     └── Group (nested)
 *           ├── Condition
 *           └── Condition
 */
import { describe, it, expect } from "vitest";
import { post } from "../tests_backend/client";
import { custField, getTenant } from "./tenant-context";
import { primaryIdScopePredicate, type TestCustomer } from "./test-factories";

const t = getTenant();
const { customers, runTag: tag } = t;

const ourIds = customers.map(c => c.primary_id);

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

/** Wrap a filter tree with primary_id scope — adds scope as first AND predicate */
function scoped(filter: any): any {
  const scope = primaryIdScopePredicate(ourIds);
  return group("AND", [scope, filter]);
}

function preview(name: string, segments: { name: string; customerProfileFilter: any }[]) {
  return post("/api/tenants/segmentation/preview", { segmentation: { name, segments } });
}

function segCount(data: any, segName: string): number {
  return data.segments.find((s: any) => s.name === segName)?.numberOfCustomer ?? -1;
}

// ─── Helpers: derive expected counts from data ──────────────────────────────

function matchCount(pred: (c: TestCustomer) => boolean): number {
  return customers.filter(pred).length;
}

// ─── Nested group: AND > (Condition + OR group) ──────────────────────────────

describe("Nested group: AND outer, OR inner", () => {
  it("adult AND (female OR income > 100K)", async () => {
    const expected = matchCount(c =>
      c.is_adult && (c.gender === "female" || c.income > 100000)
    );
    const filter = scoped(group("AND", [
      cond(custField("is_adult"), "=", { bool: [true] }),
      group("OR", [
        cond(custField("gender"), "=", { string: ["female"] }),
        cond(custField("income"), ">", { float64: [100000] }),
      ]),
    ]));

    const { status, data } = await preview(`${tag}_nested1`, [
      { name: "AdultFemOrRich", customerProfileFilter: filter },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "AdultFemOrRich")).toBe(expected);
  });
});

// ─── Nested group: OR > (AND groups) ─────────────────────────────────────────

describe("Nested group: OR outer, AND inners", () => {
  it("(female AND subscribed) OR (male AND income > 100K)", async () => {
    const expected = matchCount(c =>
      (c.gender === "female" && c.is_subscribed) ||
      (c.gender === "male" && c.income > 100000)
    );
    const filter = scoped(group("OR", [
      group("AND", [
        cond(custField("gender"), "=", { string: ["female"] }),
        cond(custField("is_subscribed"), "=", { bool: [true] }),
      ]),
      group("AND", [
        cond(custField("gender"), "=", { string: ["male"] }),
        cond(custField("income"), ">", { float64: [100000] }),
      ]),
    ]));

    const { data } = await preview(`${tag}_nested2`, [
      { name: "FemSubOrRichMale", customerProfileFilter: filter },
    ]);
    expect(segCount(data, "FemSubOrRichMale")).toBe(expected);
  });
});

// ─── Triple nesting: Group > Group > Group ───────────────────────────────────

describe("Triple nested groups", () => {
  it("AND(age >= 25, OR(AND(female, subscribed), AND(male, income > 150K)))", async () => {
    const expected = matchCount(c =>
      c.age >= 25 && (
        (c.gender === "female" && c.is_subscribed) ||
        (c.gender === "male" && c.income > 150000)
      )
    );
    const filter = scoped(group("AND", [
      cond(custField("age"), ">=", { int64: [25] }),
      group("OR", [
        group("AND", [
          cond(custField("gender"), "=", { string: ["female"] }),
          cond(custField("is_subscribed"), "=", { bool: [true] }),
        ]),
        group("AND", [
          cond(custField("gender"), "=", { string: ["male"] }),
          cond(custField("income"), ">", { float64: [150000] }),
        ]),
      ]),
    ]));

    const { data } = await preview(`${tag}_triple`, [
      { name: "Deep", customerProfileFilter: filter },
    ]);
    expect(segCount(data, "Deep")).toBe(expected);
  });
});

// ─── NEGATE on nested group ──────────────────────────────────────────────────

describe("NEGATE on nested group", () => {
  it("NOT(male AND income > 100K)", async () => {
    const expected = matchCount(c => !(c.gender === "male" && c.income > 100000));
    const filter = scoped(group("AND", [
      group("AND", [
        cond(custField("gender"), "=", { string: ["male"] }),
        cond(custField("income"), ">", { float64: [100000] }),
      ], true), // negate = true
    ]));

    const { data } = await preview(`${tag}_neg_nested`, [
      { name: "NotRichMale", customerProfileFilter: filter },
    ]);
    expect(segCount(data, "NotRichMale")).toBe(expected);
  });

  it("NOT(female) AND adult", async () => {
    const expected = matchCount(c => c.gender !== "female" && c.is_adult);
    const filter = scoped(group("AND", [
      cond(custField("is_adult"), "=", { bool: [true] }),
      group("AND", [
        cond(custField("gender"), "=", { string: ["female"] }),
      ], true),
    ]));

    const { data } = await preview(`${tag}_neg_fem_adult`, [
      { name: "NonFemAdult", customerProfileFilter: filter },
    ]);
    expect(segCount(data, "NonFemAdult")).toBe(expected);
  });
});

// ─── Multi-segment segmentation ──────────────────────────────────────────────

describe("Multi-segment segmentation", () => {
  it("3 segments: High/Mid/Low income", async () => {
    const highExp = matchCount(c => c.income > 100000);
    const midExp = matchCount(c => c.income > 0 && c.income <= 100000);
    const zeroExp = matchCount(c => c.income === 0);

    const { status, data } = await preview(`${tag}_multi_3`, [
      { name: "High (>100K)", customerProfileFilter: scoped(group("AND", [cond(custField("income"), ">", { float64: [100000] })])) },
      { name: "Mid (1-100K)", customerProfileFilter: scoped(group("AND", [cond(custField("income"), ">", { float64: [0] }), cond(custField("income"), "<=", { float64: [100000] })])) },
      { name: "Zero", customerProfileFilter: scoped(group("AND", [cond(custField("income"), "=", { float64: [0] })])) },
    ]);
    expect(status).toBe(200);
    expect(segCount(data, "High (>100K)")).toBe(highExp);
    expect(segCount(data, "Mid (1-100K)")).toBe(midExp);
    expect(segCount(data, "Zero")).toBe(zeroExp);
    // Mutually exclusive: should sum to total
    expect(highExp + midExp + zeroExp).toBe(customers.length);
  });

  it("4 segments: gender x subscription", async () => {
    const fSub = matchCount(c => c.gender === "female" && c.is_subscribed);
    const fUnsub = matchCount(c => c.gender === "female" && !c.is_subscribed);
    const mSub = matchCount(c => c.gender === "male" && c.is_subscribed);
    const mUnsub = matchCount(c => c.gender === "male" && !c.is_subscribed);

    const { data } = await preview(`${tag}_multi_4`, [
      { name: "F+Sub",   customerProfileFilter: scoped(group("AND", [cond(custField("gender"), "=", { string: ["female"] }), cond(custField("is_subscribed"), "=", { bool: [true] })])) },
      { name: "F+Unsub", customerProfileFilter: scoped(group("AND", [cond(custField("gender"), "=", { string: ["female"] }), cond(custField("is_subscribed"), "=", { bool: [false] })])) },
      { name: "M+Sub",   customerProfileFilter: scoped(group("AND", [cond(custField("gender"), "=", { string: ["male"] }), cond(custField("is_subscribed"), "=", { bool: [true] })])) },
      { name: "M+Unsub", customerProfileFilter: scoped(group("AND", [cond(custField("gender"), "=", { string: ["male"] }), cond(custField("is_subscribed"), "=", { bool: [false] })])) },
    ]);
    expect(segCount(data, "F+Sub")).toBe(fSub);
    expect(segCount(data, "F+Unsub")).toBe(fUnsub);
    expect(segCount(data, "M+Sub")).toBe(mSub);
    expect(segCount(data, "M+Unsub")).toBe(mUnsub);
  });
});

// ─── Empty result segment ────────────────────────────────────────────────────

describe("Edge case: segment with impossible condition", () => {
  it("gender = nonexistent → 0", async () => {
    const { data } = await preview(`${tag}_empty`, [
      { name: "None", customerProfileFilter: scoped(group("AND", [cond(custField("gender"), "=", { string: ["nonexistent_gender_xyz"] })])) },
    ]);
    expect(segCount(data, "None")).toBe(0);
  });

  it("adult AND minor (contradictory) → 0", async () => {
    const { data } = await preview(`${tag}_contra`, [
      { name: "Impossible", customerProfileFilter: scoped(group("AND", [
        cond(custField("is_adult"), "=", { bool: [true] }),
        cond(custField("is_adult"), "=", { bool: [false] }),
      ])) },
    ]);
    expect(segCount(data, "Impossible")).toBe(0);
  });
});

// ─── All our customers (scoped, no extra conditions) ────────────────────────

describe("Edge case: scoped predicate = all our customers", () => {
  it("no extra conditions → our customer count", async () => {
    const { data } = await preview(`${tag}_all`, [
      { name: "All", customerProfileFilter: group("AND", [primaryIdScopePredicate(ourIds)]) },
    ]);
    expect(segCount(data, "All")).toBe(customers.length);
  });
});
