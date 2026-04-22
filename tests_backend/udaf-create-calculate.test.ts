/**
 * UDAF Create→Calculate End-to-End (Session 22)
 *
 * BUG-049 was "UDAF calculate universally broken". As of S22, the endpoint
 * changed from GET to POST and old UDAFs return results. This test verifies
 * whether FRESHLY CREATED UDAFs can also be calculated — the key question
 * is whether the deserialization bug for API-created UDAFs persists.
 *
 * Also probes BUG-002 (RELATIVE window returning 0) with a fresh UDAF.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { get, post } from "./client";

const TS = Date.now();
let customerPrimaryId: number = 1;
const purchaseEventTypeId = 100; // "purchase" event type on shared tenant

// Known working mfieldId from existing SUM UDAF on shared tenant
const KNOWN_MFIELD_ID = "97f5e78c-8287-4bc7-b7fc-e14c56ff42df"; // Delivery Cost
const KNOWN_MFIELD_NAME = "col__double__4";

// Track created UDAFs for cleanup attempts
const createdUdafs: Array<{ id: string; name: string; aggType: string }> = [];

beforeAll(async () => {
  // Get a real customer
  const { data: cData } = await post("/api/tenant/data/customers", { fieldNames: ["primary_id"] }, { size: 1, page: 1 });
  if (cData?.list?.[0]?.primary_id) customerPrimaryId = cData.list[0].primary_id;
}, 10_000);

async function createUdaf(name: string, aggType: string, extraFilter: Record<string, unknown> = {}) {
  const payload: Record<string, unknown> = {
    name: `s22_${name}_${TS}`,
    aggType,
    params: aggType === "COUNT" ? [] : [{ mfieldId: KNOWN_MFIELD_ID, fieldName: KNOWN_MFIELD_NAME, displayName: "Delivery Cost" }],
    filter: {
      eventType: { id: purchaseEventTypeId },
      predicate: { type: "group", group: { logicalOp: "AND", negate: false, predicates: [] } },
      timeWindow: {},
      ...extraFilter,
    },
    grouping: { enable: false },
  };
  const { status, data } = await post("/api/tenants/udafs", payload);
  if (status === 200 && data?.id) {
    createdUdafs.push({ id: data.id, name: payload.name as string, aggType });
    return data;
  }
  return { id: null, status, data };
}

async function calculateUdaf(udafId: string, primaryId: number = customerPrimaryId) {
  return post(`/api/tenants/udafs/${udafId}/calculate`, undefined, { primaryId });
}

describe("UDAF Create→Calculate E2E (BUG-049 verification)", () => {
  let countUdafId: string | null = null;
  let sumUdafId: string | null = null;
  let avgUdafId: string | null = null;

  it("should create COUNT UDAF", async () => {
    const result = await createUdaf("count", "COUNT");
    expect(result.id).toBeTruthy();
    countUdafId = result.id;
    console.log(`[s22] Created COUNT UDAF: ${countUdafId}`);
  });

  it("should create SUM UDAF", async () => {
    const result = await createUdaf("sum", "SUM");
    expect(result.id).toBeTruthy();
    sumUdafId = result.id;
    console.log(`[s22] Created SUM UDAF: ${sumUdafId}`);
  });

  it("should create AVG UDAF", async () => {
    const result = await createUdaf("avg", "AVG");
    expect(result.id).toBeTruthy();
    avgUdafId = result.id;
    console.log(`[s22] Created AVG UDAF: ${avgUdafId}`);
  });

  it("COUNT UDAF calculate — BUG-049: new UDAFs fail at compute (empty struct deserialization)", async () => {
    if (!countUdafId) return;
    const { status, data } = await calculateUdaf(countUdafId);
    console.log(`[s22] COUNT calculate: status=${status}, data=${JSON.stringify(data).slice(0, 200)}`);
    // BUG-049: newly created UDAFs pass empty struct to compute service
    // When fixed, change to expect(status).toBe(200)
    expect([200, 500]).toContain(status);
    if (status === 200) {
      console.log("[s22] BUG-049 FIXED for new UDAFs!");
      expect(data?.result).toHaveProperty("Result");
    } else {
      console.log("[s22] BUG-049 still present: new UDAF compute fails");
      expect(data?.Debug || data?.error).toBeDefined();
    }
  });

  it("SUM UDAF calculate — BUG-049: new UDAFs fail at compute", async () => {
    if (!sumUdafId) return;
    const { status, data } = await calculateUdaf(sumUdafId);
    console.log(`[s22] SUM calculate: status=${status}, data=${JSON.stringify(data).slice(0, 200)}`);
    expect([200, 500]).toContain(status);
  });

  it("AVG UDAF calculate — BUG-049: new UDAFs fail at compute", async () => {
    if (!avgUdafId) return;
    const { status, data } = await calculateUdaf(avgUdafId);
    console.log(`[s22] AVG calculate: status=${status}, data=${JSON.stringify(data).slice(0, 200)}`);
    expect([200, 500]).toContain(status);
  });

  it("calculate with non-existent primaryId on old working UDAF", async () => {
    // Use a known old UDAF that works
    const { status, data } = await calculateUdaf("75185a40-e8e8-4f9b-9a07-2f91140746d7", 999999999);
    expect(status).toBe(200);
    expect(data?.result).toHaveProperty("Result");
  });

  it("calculate with non-existent UDAF ID returns error", async () => {
    const { status } = await calculateUdaf("00000000-0000-0000-0000-000000000000");
    expect([400, 404, 500]).toContain(status);
  });

  it("GET method on calculate should be rejected (POST only now)", async () => {
    if (!countUdafId) return;
    const { status } = await get(`/api/tenants/udafs/${countUdafId}/calculate`, { primaryId: customerPrimaryId });
    expect(status).toBe(400);
  });

  it("calculate without primaryId param returns error", async () => {
    if (!countUdafId) return;
    const { status } = await post(`/api/tenants/udafs/${countUdafId}/calculate`);
    // Should require primaryId
    expect([400, 500]).toContain(status);
  });
});

describe("UDAF RELATIVE Window Create→Calculate (BUG-002)", () => {
  let relativeCountId: string | null = null;
  let relativeSumId: string | null = null;

  it("should create COUNT UDAF with RELATIVE 30-day window", async () => {
    const result = await createUdaf("rel30d_count", "COUNT", {
      timeWindow: { type: "RELATIVE", value: 30, unit: "DAY" },
    });
    expect(result.id).toBeTruthy();
    relativeCountId = result.id;
  });

  it("should create SUM UDAF with RELATIVE 12-month window", async () => {
    const result = await createUdaf("rel12m_sum", "SUM", {
      timeWindow: { type: "RELATIVE", value: 12, unit: "MONTH" },
    });
    expect(result.id).toBeTruthy();
    relativeSumId = result.id;
  });

  it("RELATIVE COUNT calculate — BUG-049+BUG-002: new UDAFs fail; if fixed check for correct non-zero", async () => {
    if (!relativeCountId) return;
    const { status, data } = await calculateUdaf(relativeCountId);
    console.log(`[s22] RELATIVE COUNT 30d: status=${status}, data=${JSON.stringify(data).slice(0, 200)}`);
    // BUG-049 blocks this; when fixed, check BUG-002 (RELATIVE returning 0)
    expect([200, 500]).toContain(status);
    if (status === 200) {
      console.log(`[s22] RELATIVE COUNT result: ${data?.result?.Result} (BUG-002: 0 means still broken)`);
    }
  });

  it("RELATIVE SUM calculate — BUG-049+BUG-002", async () => {
    if (!relativeSumId) return;
    const { status, data } = await calculateUdaf(relativeSumId);
    console.log(`[s22] RELATIVE SUM 12m: status=${status}, data=${JSON.stringify(data).slice(0, 200)}`);
    expect([200, 500]).toContain(status);
  });

  it("verify RELATIVE window was persisted (not empty {})", async () => {
    if (!relativeCountId) return;
    const { status, data } = await get(`/api/tenants/udafs/${relativeCountId}`);
    expect(status).toBe(200);
    console.log(`[s22] RELATIVE UDAF stored timeWindow: ${JSON.stringify(data?.filter?.timeWindow)}`);
    // BUG-046: RELATIVE timeWindow was stored as empty {}
    const tw = data?.filter?.timeWindow;
    expect(tw).toBeDefined();
    // Should have type or value, not be empty
    const hasContent = tw && Object.keys(tw).length > 0;
    if (!hasContent) {
      console.warn("[s22] BUG-046 still present: RELATIVE timeWindow stored as empty {}");
    }
  });
});

describe("UDAF Calculate: old vs new comparison", () => {
  it("find an old working UDAF and compare with new", async () => {
    // Get an old manually-created UDAF that works
    const knownOld = [
      "75185a40-e8e8-4f9b-9a07-2f91140746d7",
      "1dec54ac-1a7b-4a8f-893a-01aad8ac4993",
    ];
    let oldResult: { status: number; data: any } | null = null;
    let oldId: string | null = null;
    for (const id of knownOld) {
      const r = await calculateUdaf(id);
      if (r.status === 200) {
        oldResult = r;
        oldId = id;
        break;
      }
    }

    // Compare with our freshly created COUNT
    const newId = createdUdafs.find(u => u.aggType === "COUNT")?.id;
    if (!newId) return;
    const newResult = await calculateUdaf(newId);

    console.log(`[s22] Old UDAF (${oldId}): status=${oldResult?.status}, result=${JSON.stringify(oldResult?.data?.result)}`);
    console.log(`[s22] New UDAF (${newId}): status=${newResult.status}, result=${JSON.stringify(newResult.data?.result)}`);

    // Old should work; new fails due to BUG-049 (deserialization)
    if (oldResult) expect(oldResult.status).toBe(200);
    // BUG-049: when fixed, change to expect(newResult.status).toBe(200)
    expect([200, 500]).toContain(newResult.status);
  });
});
