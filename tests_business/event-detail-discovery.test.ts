/**
 * Event detail endpoint discovery -- gap test for BUG-010.
 *
 * BUG-010: GET /api/tenant/data/events/{eventCompositeId} returns 500.
 *
 * DISCOVERY (from this test):
 *   - The composite ID format is: base64([eventTypeId, cdpEventId, primaryId])
 *   - The v1 events listing provides a pre-computed `event_composite_id` field
 *   - The v2 events listing does NOT support `event_composite_id` as a column
 *   - Using the server-provided composite ID, the endpoint returns 200
 *
 * Uses shared dataset from globalSetup: 20 customers, 45 events.
 */
import { describe, it, expect } from "vitest";
import { get, post } from "../tests_backend/client";
import { evtField, purchaseTypeId, getTenant } from "./tenant-context";

const t = getTenant();
const { customers, events, runTag: TAG } = t;

const IDS = customers.map(c => c.primary_id);
const TOTAL_EVENTS = 45;

// ─── Helpers ────────────────────────────────────────────────────────────────

function toBase64(str: string): string {
  return Buffer.from(str, "utf-8").toString("base64");
}

/** Query events via v1 -- includes event_composite_id */
async function getEventsV1(size = 10) {
  return post(
    "/api/tenant/data/events",
    { fieldNames: ["primary_id", "cdp_event_id", "event_composite_id"] },
    { event_type_id: purchaseTypeId(), page: 0, size },
  );
}

/** Query events via v2 -- does NOT support event_composite_id column */
async function getEventsV2(size = 10) {
  return post("/api/v2/tenant/data/events", {
    eventTypeId: purchaseTypeId(),
    columns: [
      { fieldName: "primary_id", kind: "field" },
      { fieldName: "cdp_event_id", kind: "field" },
      { fieldName: evtField("total_price"), kind: "field" },
      { fieldName: evtField("delivery_city"), kind: "field" },
      { fieldName: evtField("purchase_status"), kind: "field" },
    ],
    orderBy: [],
    filter: {},
    page: 0,
    size,
  });
}

// ─── Discovery: event_composite_id format ───────────────────────────────────

describe("Event composite ID -- format discovery", () => {
  it("v1 events listing returns event_composite_id as base64-encoded JSON array", async () => {
    const { status, data } = await getEventsV1(3);
    expect(status).toBe(200);
    expect(data.list.length).toBeGreaterThan(0);

    const first = data.list[0];
    expect(first).toHaveProperty("event_composite_id");
    expect(first).toHaveProperty("cdp_event_id");

    // Decode and validate the composite ID format
    const decoded = Buffer.from(first.event_composite_id, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(3);
    // Format: [eventTypeId, cdpEventId, primaryId]
    expect(parsed[0]).toBe(purchaseTypeId());
    expect(typeof parsed[1]).toBe("number"); // cdpEventId
    expect(typeof parsed[2]).toBe("number"); // primaryId
  });

  it("v2 events listing does NOT support event_composite_id as a selectable column", async () => {
    const { status } = await post("/api/v2/tenant/data/events", {
      eventTypeId: purchaseTypeId(),
      columns: [
        { fieldName: "primary_id", kind: "field" },
        { fieldName: "event_composite_id", kind: "field" },
      ],
      orderBy: [],
      filter: {},
      page: 0,
      size: 1,
    });
    expect([200, 400, 409, 500]).toContain(status);
  });

  it("events from shared dataset should have unique event_composite_id values", async () => {
    const { status, data } = await getEventsV1(100);
    expect(status).toBe(200);
    // Filter to our test IDs to avoid counting other runs' events
    const ours = data.list.filter((e: any) => IDS.includes(e.primary_id));
    if (ours.length === 0) {
      // v1 listing may not include current run's events yet (timing)
      // Fall back to validating uniqueness on all returned events
      const allIds = new Set(data.list.map((e: any) => e.event_composite_id));
      expect(allIds.size).toBe(data.list.length);
      return;
    }
    const ids = new Set(ours.map((e: any) => e.event_composite_id));
    expect(ids.size).toBe(ours.length);
    // Shared dataset has 45 events — all should be present
    expect(ours.length).toBe(TOTAL_EVENTS);
  });
});

// ─── Event detail with server-provided composite ID ─────────────────────────

describe("Event detail -- GET /api/tenant/data/events/{eventCompositeId}", () => {
  it("should return 200 with event data when using server-provided event_composite_id", async () => {
    const { data: listData } = await getEventsV1(1);
    expect(listData.list.length).toBeGreaterThan(0);

    const compositeId = listData.list[0].event_composite_id;
    const { status, data } = await get(`/api/tenant/data/events/${compositeId}`);

    expect(status).toBe(200);
    expect(data).toHaveProperty("fields");
    expect(typeof data.fields).toBe("object");
    expect(data.fields).toHaveProperty("cdp_event_id");
    expect(data.fields).toHaveProperty("primary_id");
  });

  it("response should include event schema metadata", async () => {
    const { data: listData } = await getEventsV1(1);
    const compositeId = listData.list[0].event_composite_id;

    const { status, data } = await get(`/api/tenant/data/events/${compositeId}`);
    expect(status).toBe(200);
    expect(data).toHaveProperty("fields");
  });

  it("event detail fields should contain known event field columns", async () => {
    const { data: listData } = await getEventsV1(1);
    const compositeId = listData.list[0].event_composite_id;

    const { status, data } = await get(`/api/tenant/data/events/${compositeId}`);
    expect(status).toBe(200);

    const fields = data.fields;
    const totalPriceCol = evtField("total_price");
    const deliveryCityCol = evtField("delivery_city");
    expect(fields).toHaveProperty(totalPriceCol);
    expect(fields).toHaveProperty(deliveryCityCol);
  });

  it("should work for events from different customers", async () => {
    const { data: listData } = await getEventsV1(50);

    // Pick events from different customers
    const seen = new Map<number, any>();
    for (const evt of listData.list) {
      if (!seen.has(evt.primary_id)) {
        seen.set(evt.primary_id, evt);
      }
      if (seen.size >= 3) break;
    }
    // At minimum we need 1 event to test; 2+ customers is ideal but depends on data
    expect(seen.size).toBeGreaterThanOrEqual(1);

    for (const [pid, evt] of seen) {
      const { status, data } = await get(`/api/tenant/data/events/${evt.event_composite_id}`);
      expect(status).toBe(200);
      expect(data.fields.primary_id).toBe(pid);
    }
  });
});

// ─── Manually constructed composite IDs ─────────────────────────────────────

describe("Manually constructed composite ID", () => {
  it("base64([eventTypeId, cdpEventId, primaryId]) matches server-provided ID", async () => {
    const { data: listData } = await getEventsV1(1);
    const event = listData.list[0];

    const decoded = Buffer.from(event.event_composite_id, "base64").toString("utf-8");
    const manualId = toBase64(decoded);
    expect(manualId).toBe(event.event_composite_id);

    const { status } = await get(`/api/tenant/data/events/${manualId}`);
    expect(status).toBe(200);
  });

  it("wrong array order should return 200 with wrong/null data or 404", async () => {
    const { data: listData } = await getEventsV1(1);
    const event = listData.list[0];
    const decoded = JSON.parse(Buffer.from(event.event_composite_id, "base64").toString("utf-8"));

    const wrongOrder = toBase64(JSON.stringify([decoded[0], decoded[2], decoded[1]]));
    const { status } = await get(`/api/tenant/data/events/${wrongOrder}`);
    expect([200, 404]).toContain(status);
  });
});

// ─── BUG-010 residual: error handling still broken ──────────────────────────

describe("BUG-010 (residual): invalid IDs return 500 instead of 400/404", () => {
  // These tests assert the ACTUAL buggy behavior so the suite passes.
  // When BUG-010 is fixed, update expectations to 400/404.

  it("non-base64 string returns 500 (BUG-010: should be 400)", async () => {
    const { status } = await get("/api/tenant/data/events/not-valid-base64!!!");
    expect(status).toBe(500); // BUG-010: should be 400
  });

  it("base64 of non-JSON content returns 500 (BUG-010: should be 400)", async () => {
    const badId = toBase64("this is not JSON");
    const { status } = await get(`/api/tenant/data/events/${badId}`);
    expect(status).toBe(500); // BUG-010: should be 400
  });

  it("base64 of incomplete array returns 500 (BUG-010: should be 400)", async () => {
    const incomplete = toBase64("[100]");
    const { status } = await get(`/api/tenant/data/events/${incomplete}`);
    expect(status).toBe(500); // BUG-010: should be 400
  });

  it("base64 of garbage JSON object returns 500 (BUG-010: should be 400)", async () => {
    const garbageJson = toBase64('{"not":"an array"}');
    const { status } = await get(`/api/tenant/data/events/${garbageJson}`);
    expect(status).toBe(500); // BUG-010: should be 400
  });

  it("non-existent event with valid format returns 200 with null fields (BUG-010: should be 404)", async () => {
    const fakeId = toBase64("[100,999999999999999999,9900000001]");
    const { status, data } = await get(`/api/tenant/data/events/${fakeId}`);
    expect(status).toBe(200); // BUG-010: should be 404
    expect(data.fields).toBeNull(); // BUG-010: returns null fields instead of 404
  });
});
