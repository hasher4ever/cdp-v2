/**
 * Event detail endpoint tests.
 *
 * Covers:
 *  - POST /api/tenant/data/events?event_type_id={id} — paginated event list
 *  - GET  /api/tenant/data/events/{compositeId}       — single event detail
 *
 * Key discoveries (observed, not assumed):
 *  - event_type_id is a required query parameter (not part of the POST body)
 *  - fieldNames must be present in the body (required by OpenAPI schema validation)
 *  - Composite IDs are base64-encoded JSON arrays: [eventTypeId, eventId, customerId]
 *  - Empty fieldNames [] → 200 with full column set returned
 *  - totalCount is the pagination key in list responses
 *
 * BUG-010: Both invalid-format and non-existent event IDs return 500 (should be 400 / 404)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { get, post } from "./client";

// Well-known event type with data (purchase, 65K+ events)
const PURCHASE_EVENT_TYPE_ID = 100;

// A base64 composite ID that is syntactically valid but refers to a record
// that cannot exist (max int-like values).
const NONEXISTENT_VALID_B64_ID = Buffer.from(
  JSON.stringify([PURCHASE_EVENT_TYPE_ID, 999999999999999, 999999999999])
).toString("base64");

// A clearly malformed ID
const INVALID_FORMAT_ID = "not-a-valid-event-id";

// ── Helpers ──────────────────────────────────────────────────────────────────

function listEvents(page: number, pageSize: number, fieldNames: string[] = ["event_type"]) {
  return post(
    `/api/tenant/data/events?event_type_id=${PURCHASE_EVENT_TYPE_ID}`,
    { page, pageSize, fieldNames }
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Event list — POST /api/tenant/data/events?event_type_id=100", () => {
  it("should return 200 with list and totalCount", async () => {
    const { status, data } = await listEvents(1, 5);
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
    expect(Array.isArray(data.list)).toBe(true);
    expect(data.list.length).toBeGreaterThan(0);
    expect(data).toHaveProperty("totalCount");
    expect(typeof data.totalCount).toBe("number");
    expect(data.totalCount).toBeGreaterThan(0);
  });

  it("should include event_composite_id on each list item", async () => {
    const { status, data } = await listEvents(1, 5);
    expect(status).toBe(200);
    for (const item of data.list.slice(0, 3)) {
      expect(item).toHaveProperty("event_composite_id");
      expect(typeof item.event_composite_id).toBe("string");
      expect(item.event_composite_id.length).toBeGreaterThan(0);
    }
  });

  it("should return event_type metadata in the response", async () => {
    const { status, data } = await listEvents(1, 5);
    expect(status).toBe(200);
    expect(data).toHaveProperty("event_type");
    expect(data.event_type).toHaveProperty("id", PURCHASE_EVENT_TYPE_ID);
    expect(data.event_type).toHaveProperty("name", "purchase");
  });

  it("should return 200 with full schema when fieldNames is empty []", async () => {
    const { status, data } = await post(
      `/api/tenant/data/events?event_type_id=${PURCHASE_EVENT_TYPE_ID}`,
      { page: 1, pageSize: 5, fieldNames: [] }
    );
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
    expect(Array.isArray(data.list)).toBe(true);
  });

  it("should return 400 when event_type_id query param is missing", async () => {
    // The OpenAPI filter enforces event_type_id as required
    const { status } = await post("/api/tenant/data/events", {
      page: 1,
      pageSize: 5,
      fieldNames: ["event_type"],
    });
    expect(status).toBe(400);
  });

  it("should return 400 when fieldNames is absent from body", async () => {
    const { status } = await post(
      `/api/tenant/data/events?event_type_id=${PURCHASE_EVENT_TYPE_ID}`,
      { page: 1, pageSize: 5 }
    );
    expect(status).toBe(400);
  });

  it("page 1 and page 2 should not raise errors (pagination sanity)", async () => {
    const { status: s1 } = await listEvents(1, 5);
    const { status: s2 } = await listEvents(2, 5);
    expect(s1).toBe(200);
    expect(s2).toBe(200);
  });
});

describe("Event detail — GET /api/tenant/data/events/{compositeId}", () => {
  let realCompositeId: string | null = null;

  beforeAll(async () => {
    const { status, data } = await listEvents(1, 5);
    if (status === 200 && Array.isArray(data.list) && data.list.length > 0) {
      realCompositeId = data.list[0].event_composite_id ?? null;
    }
  });

  it("should return 200 with event fields for a real composite ID", async () => {
    if (!realCompositeId) {
      console.warn("[event-detail] No real composite ID discovered — skipping");
      return;
    }
    const { status, data } = await get(
      `/api/tenant/data/events/${encodeURIComponent(realCompositeId)}`
    );
    expect(status).toBe(200);
    expect(data).toBeDefined();
    expect(data).not.toBeNull();
    // Response has a 'fields' object with cdp_event_id
    expect(data).toHaveProperty("fields");
    expect(data.fields).toHaveProperty("cdp_event_id");
  });

  it("should return 500 for invalid ID format — BUG-010 regression guard", async () => {
    // BUG-010: backend panics with 500 instead of validating and returning 400.
    // When fixed, this test should be updated: expect(status).toBe(400)
    const { status } = await get(`/api/tenant/data/events/${INVALID_FORMAT_ID}`); // BUG-010
    expect(status).toBe(500); // BUG-010: should be 400
  });

  it("should return 200 with null fields for non-existent valid-format ID — BUG-010 regression guard", async () => {
    // BUG-010: a valid base64 composite ID pointing to a non-existent record returns
    // 200 with {"fields": null, "schema": {...}} instead of 404.
    // When fixed, this test should be updated: expect(status).toBe(404)
    const { status, data } = await get( // BUG-010
      `/api/tenant/data/events/${encodeURIComponent(NONEXISTENT_VALID_B64_ID)}`
    );
    expect(status).toBe(200); // BUG-010: should be 404
    // Confirm the "empty" behavior: fields is null even though schema is present
    expect(data).toHaveProperty("fields");
    expect(data.fields).toBeNull(); // BUG-010: null instead of a 404 response
  });
});
