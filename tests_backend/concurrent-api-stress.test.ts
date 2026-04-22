/**
 * Concurrent API Stress — parallel request handling.
 *
 * Hypothesis: The segmentation mutex (BUG-043) reveals fragile concurrency handling.
 * Other endpoints may also have race conditions, lost updates, or crashes under
 * concurrent requests. We test:
 * 1. Parallel reads (should be safe)
 * 2. Parallel writes (UDAF create, template create)
 * 3. Read-write interleaving
 * 4. Rapid-fire same endpoint
 */
import { describe, it, expect } from "vitest";
import { get, post, del } from "./client";

const TS = Date.now();
const PURCHASE_EVENT = { id: 100, name: "purchase", flagSystemEvent: false };
const createdIds: { type: string; id: string }[] = [];

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeCountUdaf(name: string) {
  return {
    name,
    aggType: "COUNT",
    params: [],
    filter: {
      eventType: PURCHASE_EVENT,
      predicate: { type: "group", group: { logicalOp: "AND", predicates: [], negate: false } },
      timeWindow: {},
    },
    grouping: { enable: false },
  };
}

function makeTemplate(name: string) {
  return {
    name,
    template_name: name,
    subject: "Test Subject",
    content: "Hello world",
    content_type: "text",
    variables: {},
  };
}

// Correct API paths
const TEMPLATE_PATH = "/api/tenant/template";
const COMMCHAN_PATH = "/api/tenants/commchan";

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("Concurrent API Stress", () => {

  // ── 1. Parallel reads — should never fail ────────────────────────────────

  describe("1. Parallel reads (5 concurrent)", () => {
    it("should handle 5 concurrent GET /api/tenants/udafs/types", async () => {
      const requests = Array.from({ length: 5 }, () =>
        get("/api/tenants/udafs/types"),
      );
      const results = await Promise.all(requests);

      for (const r of results) {
        expect(r.status).toBe(200);
      }
      // All should return same count
      const counts = results.map(r => (r.data?.items || r.data || []).length);
      const uniqueCounts = [...new Set(counts)];
      expect(uniqueCounts.length).toBe(1);
      console.log(`5 concurrent reads: all ${results[0].status}, count=${counts[0]}`);
    });

    it("should handle 5 concurrent GET /api/tenants/segmentation", async () => {
      const requests = Array.from({ length: 5 }, () =>
        get("/api/tenants/segmentation", { page: 1, size: 5 }),
      );
      const results = await Promise.all(requests);

      for (const r of results) {
        expect(r.status).toBe(200);
      }
      console.log(`5 concurrent segmentation reads: all ${results[0].status}`);
    });

    it("should handle 5 concurrent customer list requests", async () => {
      const requests = Array.from({ length: 5 }, () =>
        post("/api/tenant/data/customers", {
          page: 1, size: 1, fieldNames: ["api_customer_name_first"],
        }),
      );
      const results = await Promise.all(requests);

      const statuses = results.map(r => r.status);
      const allOk = statuses.every(s => s === 200);
      if (!allOk) {
        console.log(`FINDING: Concurrent customer reads not all 200: ${JSON.stringify(statuses)}`);
      }
      // At least 3 of 5 should succeed
      expect(statuses.filter(s => s === 200).length).toBeGreaterThanOrEqual(3);
    });
  });

  // ── 2. Parallel writes — race condition detection ────────────────────────

  describe("2. Parallel writes (UDAF create)", () => {
    it("should handle 5 concurrent UDAF creates with unique names", async () => {
      const requests = Array.from({ length: 5 }, (_, i) =>
        post("/api/tenants/udafs", makeCountUdaf(`test_conc_${TS}_${i}`)),
      );
      const results = await Promise.all(requests);

      const statuses = results.map(r => r.status);
      const successes = results.filter(r => r.status === 200 || r.status === 201);
      const failures = results.filter(r => r.status !== 200 && r.status !== 201);

      console.log(`5 concurrent UDAF creates: ${successes.length} succeeded, ${failures.length} failed`);
      if (failures.length > 0) {
        console.log(`Failure statuses: ${failures.map(f => f.status).join(", ")}`);
        console.log(`FINDING: Concurrent UDAF creates partially fail — possible write contention`);
      }

      // Track for cleanup
      for (const r of successes) {
        if (r.data?.id) createdIds.push({ type: "udaf", id: r.data.id });
      }

      // At least some should succeed
      expect(successes.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle 3 concurrent UDAF creates with SAME name", async () => {
      const name = `test_conc_dup_${TS}`;
      const requests = Array.from({ length: 3 }, () =>
        post("/api/tenants/udafs", makeCountUdaf(name)),
      );
      const results = await Promise.all(requests);

      const successes = results.filter(r => r.status === 200 || r.status === 201);
      console.log(`3 concurrent same-name UDAF creates: ${successes.length} succeeded`);

      // Known: CDP allows duplicate names. All 3 might succeed.
      if (successes.length === 3) {
        console.log("All 3 duplicates created — confirmed: no unique name constraint");
      } else if (successes.length < 3) {
        console.log(`FINDING: ${3 - successes.length} rejected under concurrency — possible race condition`);
      }

      for (const r of successes) {
        if (r.data?.id) createdIds.push({ type: "udaf", id: r.data.id });
      }
    });
  });

  describe("3. Parallel template writes", () => {
    it("should handle 5 concurrent template creates", async () => {
      const requests = Array.from({ length: 5 }, (_, i) =>
        post(TEMPLATE_PATH, makeTemplate(`test_conc_tpl_${TS}_${i}`)),
      );
      const results = await Promise.all(requests);

      const successes = results.filter(r => r.status === 200 || r.status === 201);
      const failures = results.filter(r => r.status !== 200 && r.status !== 201);

      console.log(`5 concurrent template creates: ${successes.length} succeeded, ${failures.length} failed`);
      if (failures.length > 0) {
        console.log(`Failure details: ${failures.map(f => `${f.status}: ${JSON.stringify(f.data).substring(0, 100)}`).join("; ")}`);
      }

      for (const r of successes) {
        if (r.data?.id) createdIds.push({ type: "template", id: r.data.id });
      }

      expect(successes.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ── 4. Parallel commchan creates ────────────────────────────────────────

  describe("4. Parallel commchan writes", () => {
    it("should handle 5 concurrent blackhole commchan creates", async () => {
      const requests = Array.from({ length: 5 }, (_, i) =>
        post(COMMCHAN_PATH, {
          name: `test_conc_bh_${TS}_${i}`,
          kind: "blackhole",
          chanconf: {},
          mappings: {},
        }),
      );
      const results = await Promise.all(requests);

      const successes = results.filter(r => r.status === 200 || r.status === 201);
      const failures = results.filter(r => r.status !== 200 && r.status !== 201);

      console.log(`5 concurrent commchan creates: ${successes.length} ok, ${failures.length} fail`);
      if (failures.length > 0) {
        console.log(`FINDING: Concurrent commchan creates partially fail: ${failures.map(f => f.status)}`);
      }

      for (const r of successes) {
        if (r.data?.id) createdIds.push({ type: "commchan", id: r.data.id });
      }

      expect(successes.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ── 5. Read-write interleaving ───────────────────────────────────────────

  describe("5. Read-write interleaving", () => {
    it("should handle mixed reads and writes concurrently", async () => {
      const reads = [
        get("/api/tenants/udafs/types"),
        get("/api/tenants/segmentation", { page: 1, size: 1 }),
        get("/api/tenant/template", { page: 1, size: 1 }),
      ];
      const writes = [
        post("/api/tenants/udafs", makeCountUdaf(`test_interleave_${TS}`)),
        post(TEMPLATE_PATH, makeTemplate(`test_interleave_tpl_${TS}`)),
      ];

      const results = await Promise.all([...reads, ...writes]);

      const readResults = results.slice(0, 3);
      const writeResults = results.slice(3);

      const readOk = readResults.filter(r => r.status === 200).length;
      const writeOk = writeResults.filter(r => r.status === 200 || r.status === 201).length;

      console.log(`Interleaved: ${readOk}/3 reads ok, ${writeOk}/2 writes ok`);

      if (readOk < 3 || writeOk < 2) {
        console.log("FINDING: Read-write interleaving caused failures");
      }

      for (const r of writeResults) {
        if (r.data?.id) {
          createdIds.push({ type: "mixed", id: r.data.id });
        }
      }

      expect(readOk).toBe(3);
    });
  });

  // ── 6. Rapid-fire same endpoint ──────────────────────────────────────────

  describe("6. Rapid-fire 10 requests to same endpoint", () => {
    it("should handle 10 concurrent reads to event-types/count", async () => {
      const requests = Array.from({ length: 10 }, () =>
        get("/api/tenant/data/event-types/count"),
      );
      const results = await Promise.all(requests);

      const statuses = results.map(r => r.status);
      const ok = statuses.filter(s => s === 200).length;
      const fail = statuses.filter(s => s !== 200);

      console.log(`10 rapid-fire reads: ${ok}/10 ok`);
      if (fail.length > 0) {
        console.log(`FINDING: ${fail.length} failures under 10x concurrency: ${fail.join(", ")}`);
      }

      expect(ok).toBeGreaterThanOrEqual(8);
    });

    it("should handle 10 concurrent schema field list requests", async () => {
      const requests = Array.from({ length: 10 }, () =>
        get("/api/tenants/schema/customers/fields"),
      );
      const results = await Promise.all(requests);

      const ok = results.filter(r => r.status === 200).length;
      console.log(`10 rapid-fire schema reads: ${ok}/10 ok`);
      expect(ok).toBeGreaterThanOrEqual(8);
    });
  });

  // ── 7. Cleanup ───────────────────────────────────────────────────────────

  describe("7. Cleanup", () => {
    it("should clean up created resources (best effort)", async () => {
      let deleted = 0;
      for (const item of createdIds) {
        let path: string;
        if (item.type === "udaf") path = `/api/tenants/udafs/${item.id}`;
        else if (item.type === "template") path = `${TEMPLATE_PATH}/${item.id}`;
        else if (item.type === "commchan") path = `${COMMCHAN_PATH}/${item.id}`;
        else path = `/api/tenants/udafs/${item.id}`; // fallback
        const { status } = await del(path);
        if (status === 200 || status === 204) deleted++;
      }
      console.log(`Cleanup: ${deleted}/${createdIds.length} deleted`);
    });
  });
});
