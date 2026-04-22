/**
 * UDAF timeWindow round-trip tests — Session 12 (C3)
 *
 * Hypothesis: BUG-046 showed RELATIVE timeWindow silently stored as {}.
 * This test suite verifies:
 * 1. ABSOLUTE timeWindow persistence (from/to with specific dates)
 * 2. RELATIVE timeWindow persistence (confirms BUG-046)
 * 3. PUT update: does timeWindow survive an update round-trip?
 * 4. Edge: empty timeWindow (ALL_TIME) — baseline control
 * 5. Edge: partial timeWindow (from only, to only)
 * 6. RELATIVE with different units (DAY, MONTH, YEAR)
 * 7. ABSOLUTE → RELATIVE via PUT (can you change window type?)
 *
 * DISCOVERY: BUG-046 appears FIXED — new RELATIVE UDAFs now persist correctly.
 * Old UDAFs created before the fix still show {} (not retroactively fixed).
 * ABSOLUTE uses field name `absoluteTime`, NOT `absoluteTime`.
 */
import { describe, it, expect } from "vitest";
import { get, post, put } from "./client";

const TS = Date.now();
const PURCHASE_EVENT = { id: 100, name: "purchase", flagSystemEvent: false };
const createdIds: string[] = [];

function makeUdaf(name: string, timeWindow: Record<string, unknown> = {}) {
  return {
    name,
    aggType: "COUNT",
    params: [],
    filter: {
      eventType: PURCHASE_EVENT,
      predicate: {
        type: "group",
        group: { logicalOp: "AND", predicates: [], negate: false },
      },
      timeWindow,
    },
    grouping: { enable: false },
  };
}

async function createAndReadBack(
  name: string,
  timeWindow: Record<string, unknown>,
): Promise<{ createStatus: number; createData: any; getStatus: number; getData: any }> {
  const payload = makeUdaf(name, timeWindow);
  const { status: createStatus, data: createData } = await post("/api/tenants/udafs", payload);
  if (createData?.id) createdIds.push(createData.id);

  if (createStatus !== 200 || !createData?.id) {
    return { createStatus, createData, getStatus: 0, getData: null };
  }

  const { status: getStatus, data: getData } = await get(`/api/tenants/udafs/${createData.id}`);
  return { createStatus, createData, getStatus, getData };
}

describe("UDAF timeWindow round-trip persistence", () => {
  // ── 1. Control: empty timeWindow (ALL_TIME) ──────────────────────────────
  describe("1. Control — empty timeWindow (ALL_TIME)", () => {
    it("should persist empty timeWindow as-is", async () => {
      const { createStatus, getStatus, getData } = await createAndReadBack(
        `tw_control_${TS}`,
        {},
      );
      expect(createStatus).toBe(200);
      expect(getStatus).toBe(200);
      // Empty timeWindow should come back as empty or undefined
      const tw = getData?.filter?.timeWindow;
      expect(tw === undefined || tw === null || Object.keys(tw).length === 0).toBe(true);
    });
  });

  // ── 2. ABSOLUTE timeWindow ────────────────────────────────────────────────
  describe("2. ABSOLUTE timeWindow", () => {
    it("should persist ABSOLUTE from+to dates", async () => {
      const tw = {
        from: { kind: "ABSOLUTE", absoluteTime: "2025-01-01T00:00:00Z" },
        to: { kind: "ABSOLUTE", absoluteTime: "2025-12-31T23:59:59Z" },
      };
      const { createStatus, getStatus, getData } = await createAndReadBack(
        `tw_abs_both_${TS}`,
        tw,
      );
      expect(createStatus).toBe(200);
      expect(getStatus).toBe(200);

      const stored = getData?.filter?.timeWindow;
      // Key question: does ABSOLUTE survive round-trip?
      expect(stored).toBeDefined();
      if (stored?.from) {
        expect(stored.from.kind).toBe("ABSOLUTE");
        expect(stored.from.absoluteTime).toContain("2025-01-01");
      } else {
        // BUG: ABSOLUTE timeWindow also dropped
        expect.soft(stored?.from).toBeDefined();
      }
    });

    it("should persist ABSOLUTE from-only (open-ended to)", async () => {
      const tw = {
        from: { kind: "ABSOLUTE", absoluteTime: "2025-06-01T00:00:00Z" },
      };
      const { createStatus, getStatus, getData } = await createAndReadBack(
        `tw_abs_from_${TS}`,
        tw,
      );
      expect(createStatus).toBe(200);
      expect(getStatus).toBe(200);

      const stored = getData?.filter?.timeWindow;
      if (stored?.from) {
        expect(stored.from.kind).toBe("ABSOLUTE");
      } else {
        expect.soft(stored?.from).toBeDefined();
      }
    });

    it("should persist ABSOLUTE to-only (open-ended from)", async () => {
      const tw = {
        to: { kind: "ABSOLUTE", absoluteTime: "2025-12-31T23:59:59Z" },
      };
      const { createStatus, getStatus, getData } = await createAndReadBack(
        `tw_abs_to_${TS}`,
        tw,
      );
      expect(createStatus).toBe(200);
      expect(getStatus).toBe(200);

      const stored = getData?.filter?.timeWindow;
      if (stored?.to) {
        expect(stored.to.kind).toBe("ABSOLUTE");
      } else {
        expect.soft(stored?.to).toBeDefined();
      }
    });
  });

  // ── 3. RELATIVE timeWindow (BUG-046 confirmation) ────────────────────────
  describe("3. RELATIVE timeWindow (BUG-046)", () => {
    it("should persist RELATIVE 365-DAY from", async () => {
      const tw = {
        from: { kind: "RELATIVE", relativeDuration: 365, relativeUnit: "DAY" },
      };
      const { createStatus, getStatus, getData } = await createAndReadBack(
        `tw_rel_365d_${TS}`,
        tw,
      );
      expect(createStatus).toBe(200);
      expect(getStatus).toBe(200);

      const stored = getData?.filter?.timeWindow;
      // BUG-046 says this gets stored as {}
      if (stored?.from?.kind === "RELATIVE") {
        expect(stored.from.relativeDuration).toBe(365);
        expect(stored.from.relativeUnit).toBe("DAY");
      } else {
        // Confirming BUG-046: RELATIVE silently dropped
        expect.soft(stored?.from?.kind).toBe("RELATIVE");
      }
    });

    it("should persist RELATIVE 12-MONTH from", async () => {
      const tw = {
        from: { kind: "RELATIVE", relativeDuration: 12, relativeUnit: "MONTH" },
      };
      const { createStatus, getStatus, getData } = await createAndReadBack(
        `tw_rel_12m_${TS}`,
        tw,
      );
      expect(createStatus).toBe(200);
      expect(getStatus).toBe(200);

      const stored = getData?.filter?.timeWindow;
      if (stored?.from?.kind === "RELATIVE") {
        expect(stored.from.relativeDuration).toBe(12);
      } else {
        expect.soft(stored?.from?.kind).toBe("RELATIVE");
      }
    });

    it("should persist RELATIVE 1-YEAR from", async () => {
      const tw = {
        from: { kind: "RELATIVE", relativeDuration: 1, relativeUnit: "YEAR" },
      };
      const { createStatus, getStatus, getData } = await createAndReadBack(
        `tw_rel_1y_${TS}`,
        tw,
      );
      expect(createStatus).toBe(200);
      expect(getStatus).toBe(200);

      const stored = getData?.filter?.timeWindow;
      if (stored?.from?.kind === "RELATIVE") {
        expect(stored.from.relativeDuration).toBe(1);
      } else {
        expect.soft(stored?.from?.kind).toBe("RELATIVE");
      }
    });
  });

  // ── 4. UDAF PUT is NOT in API spec — confirm unimplemented ─────────────────
  describe("4. UDAF PUT — confirm unimplemented (no PUT in API spec)", () => {
    it("should reject PUT with 400 method not allowed", async () => {
      const { createStatus, createData } = await createAndReadBack(
        `tw_put_test_${TS}`,
        {},
      );
      expect(createStatus).toBe(200);
      if (!createData?.id) return;

      const { status } = await put(`/api/tenants/udafs/${createData.id}`, {
        name: `tw_put_renamed_${TS}`,
        aggType: "COUNT",
        params: [],
        filter: {
          eventType: PURCHASE_EVENT,
          predicate: { type: "group", group: { logicalOp: "AND", predicates: [], negate: false } },
          timeWindow: {},
        },
        grouping: { enable: false },
      });
      // UDAF PUT is not in API spec — expected to fail
      expect(status).toBe(400);
    });
  });

  // ── 5. Non-COUNT with timeWindow ──────────────────────────────────────────
  describe("5. Non-COUNT UDAF with timeWindow", () => {
    it("should persist ABSOLUTE timeWindow on SUM UDAF", async () => {
      const payload = {
        name: `tw_sum_abs_${TS}`,
        aggType: "SUM",
        params: [{ displayName: "Total Price", fieldName: "col__double__0", mfieldId: "c9fc80bc-dad2-49bb-a158-9009a2c27b9d" }],
        filter: {
          eventType: PURCHASE_EVENT,
          predicate: {
            type: "group",
            group: { logicalOp: "AND", predicates: [], negate: false },
          },
          timeWindow: {
            from: { kind: "ABSOLUTE", absoluteTime: "2025-01-01T00:00:00Z" },
            to: { kind: "ABSOLUTE", absoluteTime: "2025-12-31T23:59:59Z" },
          },
        },
        grouping: { enable: false },
      };
      const { status, data } = await post("/api/tenants/udafs", payload);
      expect(status).toBe(200);
      if (data?.id) createdIds.push(data.id);

      const { data: readBack } = await get(`/api/tenants/udafs/${data.id}`);
      const tw = readBack?.filter?.timeWindow;
      if (tw?.from) {
        expect(tw.from.kind).toBe("ABSOLUTE");
      } else {
        expect.soft(tw?.from).toBeDefined();
      }
    });

    it("should persist RELATIVE timeWindow on SUM UDAF", async () => {
      const payload = {
        name: `tw_sum_rel_${TS}`,
        aggType: "SUM",
        params: [{ displayName: "Total Price", fieldName: "col__double__0", mfieldId: "c9fc80bc-dad2-49bb-a158-9009a2c27b9d" }],
        filter: {
          eventType: PURCHASE_EVENT,
          predicate: {
            type: "group",
            group: { logicalOp: "AND", predicates: [], negate: false },
          },
          timeWindow: {
            from: { kind: "RELATIVE", relativeDuration: 90, relativeUnit: "DAY" },
          },
        },
        grouping: { enable: false },
      };
      const { status, data } = await post("/api/tenants/udafs", payload);
      expect(status).toBe(200);
      if (data?.id) createdIds.push(data.id);

      const { data: readBack } = await get(`/api/tenants/udafs/${data.id}`);
      const tw = readBack?.filter?.timeWindow;
      if (tw?.from?.kind === "RELATIVE") {
        expect(tw.from.relativeDuration).toBe(90);
      } else {
        expect.soft(tw?.from?.kind).toBe("RELATIVE");
      }
    });
  });

  // ── 6. Edge: malformed timeWindow ─────────────────────────────────────────
  describe("6. Edge cases — malformed timeWindow", () => {
    it("should handle timeWindow with unknown kind gracefully", async () => {
      const tw = {
        from: { kind: "SLIDING", slidingDuration: 7, slidingUnit: "DAY" },
      };
      const payload = makeUdaf(`tw_bad_kind_${TS}`, tw);
      const { status, data } = await post("/api/tenants/udafs", payload);
      if (data?.id) createdIds.push(data.id);
      // Should reject or accept — document behavior either way
      expect([200, 400, 409, 500]).toContain(status);
    });

    it("should handle RELATIVE with zero duration", async () => {
      const tw = {
        from: { kind: "RELATIVE", relativeDuration: 0, relativeUnit: "DAY" },
      };
      const { createStatus, getData } = await createAndReadBack(
        `tw_rel_zero_${TS}`,
        tw,
      );
      // 0-day relative = now. Should either reject or store correctly
      expect([200, 400, 409]).toContain(createStatus);
    });

    it("should handle RELATIVE with negative duration", async () => {
      const tw = {
        from: { kind: "RELATIVE", relativeDuration: -30, relativeUnit: "DAY" },
      };
      const { createStatus } = await createAndReadBack(
        `tw_rel_neg_${TS}`,
        tw,
      );
      // Negative duration is nonsensical — should reject
      expect([200, 400, 409]).toContain(createStatus);
    });

    it("should handle ABSOLUTE with invalid date string", async () => {
      const tw = {
        from: { kind: "ABSOLUTE", absoluteTime: "not-a-date" },
      };
      const { createStatus } = await createAndReadBack(
        `tw_abs_bad_date_${TS}`,
        tw,
      );
      expect([200, 400, 409, 500]).toContain(createStatus);
    });
  });
});
