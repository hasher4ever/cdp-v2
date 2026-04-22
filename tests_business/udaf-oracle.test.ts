/**
 * UDAF Value Oracle — per-customer full-dataset regression guard.
 *
 * Purpose: one file whose *only* job is to prove that backend UDAF aggregation
 * agrees with an independent client-side computation over the shared dataset.
 *
 * The per-field and per-aggregate tests in udaf-field-types.test.ts / udaf-logic
 * already assert this for specific customers, but they give the backend many
 * chances to silently diverge from truth — a single miscomputed SUM on
 * customers[7] wouldn't be noticed by any existing test.
 *
 * This test sweeps SUM(total_price), COUNT, AVG across EVERY customer in the
 * shared dataset and reports any disagreement between:
 *   - independently computed expected value (events.reduce over the dataset)
 *   - backend UDAF value (via calculate endpoint)
 *
 * Skip semantics:
 *   - Whole suite skips if UDAF calculate is broken on shared tenant.
 *   - Individual customer skipped if UDAF not materialized within probe window.
 *   - Test skips (doesn't pass) if < 50% materialized — can't claim coverage.
 *   - Test fails loudly if materialized customers disagree with expected values.
 *
 * A regression in the backend aggregation that shifts even one customer's value
 * shows up here as a hard failure.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { evtField, purchaseTypeId, getTenant, isUdafCalculateHealthy } from "./tenant-context";
import { createAndVerifyUdaf, waitForUdaf } from "./udaf-helpers";

const CALCULATE_OK = isUdafCalculateHealthy();

const t = getTenant();
const { customers, events, runTag: TAG } = t;

const noFilter = { type: "group" as const, group: { logicalOp: "AND" as const, predicates: [], negate: false } };

/** Compute per-customer expected values from the shared events (oracle). */
function computeExpected() {
  return customers.map((c) => {
    const ce = events.filter((e) => e.primary_id === c.primary_id);
    const sum = ce.reduce((s, e) => s + e.total_price, 0);
    const count = ce.length;
    const avg = count === 0 ? 0 : sum / count;
    return { primary_id: c.primary_id, first_name: c.first_name, sum, count, avg };
  });
}

const MIN_COVERAGE = 0.5; // must have ≥50% of customers materialized to trust the sweep

describe.skipIf(!CALCULATE_OK)("UDAF Oracle: full-dataset regression guard", () => {
  let sumUdafId: string;
  let countUdafId: string;
  let avgUdafId: string;
  const expected = computeExpected();

  beforeAll(async () => {
    [sumUdafId, countUdafId, avgUdafId] = await Promise.all([
      createAndVerifyUdaf({
        name: `${TAG}_oracle_sum`, aggType: "SUM",
        params: [{ fieldName: evtField("total_price") }],
        filter: { eventType: { id: purchaseTypeId(), name: "purchase" }, predicate: noFilter, timeWindow: {} },
      }),
      createAndVerifyUdaf({
        name: `${TAG}_oracle_count`, aggType: "COUNT", params: [],
        filter: { eventType: { id: purchaseTypeId(), name: "purchase" }, predicate: noFilter, timeWindow: {} },
      }),
      createAndVerifyUdaf({
        name: `${TAG}_oracle_avg`, aggType: "AVG",
        params: [{ fieldName: evtField("total_price") }],
        filter: { eventType: { id: purchaseTypeId(), name: "purchase" }, predicate: noFilter, timeWindow: {} },
      }),
    ]);
  });

  it("SUM(total_price) across all customers matches oracle (per-customer)", async (ctx) => {
    const disagreements: string[] = [];
    let materialized = 0;
    for (const exp of expected) {
      const actual = await waitForUdaf(sumUdafId, exp.primary_id);
      if (actual === null) continue;
      materialized++;
      // Allow small floating-point tolerance; disagreement > 0.01 is a real bug.
      if (Math.abs(actual - exp.sum) > 0.01) {
        disagreements.push(`${exp.first_name} (id=${exp.primary_id}): expected ${exp.sum.toFixed(2)}, got ${actual}`);
      }
    }
    if (materialized / expected.length < MIN_COVERAGE) {
      ctx.skip(`only ${materialized}/${expected.length} customers materialized (<${MIN_COVERAGE * 100}%) — compute cache cold`);
      return;
    }
    expect(disagreements, `SUM disagreements:\n  ${disagreements.join("\n  ")}`).toEqual([]);
  });

  it("COUNT(*) across all customers matches oracle (per-customer)", async (ctx) => {
    const disagreements: string[] = [];
    let materialized = 0;
    for (const exp of expected) {
      const actual = await waitForUdaf(countUdafId, exp.primary_id);
      if (actual === null) continue;
      materialized++;
      if (actual !== exp.count) {
        disagreements.push(`${exp.first_name} (id=${exp.primary_id}): expected ${exp.count}, got ${actual}`);
      }
    }
    if (materialized / expected.length < MIN_COVERAGE) {
      ctx.skip(`only ${materialized}/${expected.length} customers materialized (<${MIN_COVERAGE * 100}%) — compute cache cold`);
      return;
    }
    expect(disagreements, `COUNT disagreements:\n  ${disagreements.join("\n  ")}`).toEqual([]);
  });

  it("AVG(total_price) across all customers matches oracle (per-customer)", async (ctx) => {
    const disagreements: string[] = [];
    let materialized = 0;
    for (const exp of expected) {
      const actual = await waitForUdaf(avgUdafId, exp.primary_id);
      if (actual === null) continue;
      materialized++;
      // AVG for 0-event customers: backend may return 0 or null.
      // Only compare when there's events to compute against.
      if (exp.count === 0) {
        if (actual !== 0) {
          disagreements.push(`${exp.first_name} (id=${exp.primary_id}, no events): expected 0, got ${actual}`);
        }
        continue;
      }
      if (Math.abs(actual - exp.avg) > 0.01) {
        disagreements.push(`${exp.first_name} (id=${exp.primary_id}): expected ${exp.avg.toFixed(2)}, got ${actual}`);
      }
    }
    if (materialized / expected.length < MIN_COVERAGE) {
      ctx.skip(`only ${materialized}/${expected.length} customers materialized (<${MIN_COVERAGE * 100}%) — compute cache cold`);
      return;
    }
    expect(disagreements, `AVG disagreements:\n  ${disagreements.join("\n  ")}`).toEqual([]);
  });

  it("cross-aggregate invariant: for every materialized customer, AVG * COUNT == SUM", async (ctx) => {
    // This catches cases where individual per-customer SUM/COUNT/AVG all look
    // plausible in isolation but are mutually inconsistent (backend computing
    // them from different event sets due to a filter or time-window bug).
    const disagreements: string[] = [];
    let compared = 0;
    for (const exp of expected) {
      if (exp.count === 0) continue; // AVG undefined when count=0
      const [s, c, a] = await Promise.all([
        waitForUdaf(sumUdafId, exp.primary_id),
        waitForUdaf(countUdafId, exp.primary_id),
        waitForUdaf(avgUdafId, exp.primary_id),
      ]);
      if (s === null || c === null || a === null) continue;
      compared++;
      if (Math.abs(a * c - s) > 0.01) {
        disagreements.push(`${exp.first_name}: AVG(${a}) * COUNT(${c}) = ${a * c}, but SUM=${s}`);
      }
    }
    if (compared === 0) {
      ctx.skip("no customers had all three UDAFs materialized");
      return;
    }
    expect(disagreements, `AVG*COUNT vs SUM disagreements:\n  ${disagreements.join("\n  ")}`).toEqual([]);
  });
});
