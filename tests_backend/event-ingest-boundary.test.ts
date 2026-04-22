/**
 * Boundary & edge-case tests for the unauthenticated event ingestion endpoint.
 *
 * POST /cdp-ingest/ingest/tenant/{tenantId}/async/events
 *
 * This endpoint is unauthenticated — no Bearer token needed.
 *
 * The shared tenant has two usable event types:
 *   - "add_to_cart" (ID 102): requires primary_id + event_type + item_id (BIGINT)
 *   - "purchase"    (ID 100): requires only primary_id + event_type
 *
 * MIN_VALID uses "add_to_cart" with item_id=1 (satisfies all required fields).
 * MIN_VALID_PURCHASE uses "purchase" with no extra required fields.
 *
 * Response shape mirrors customer ingest:
 *   { accepted: N, rejected: M, items: [{ status: "accepted"|"rejected", error?, ignoredFields? }] }
 *
 * Discoveries from reconnaissance:
 *   - item_id must be a BIGINT (integer), not a string — "invalid integer number" if wrong type
 *   - event_type name must exactly match an applied event type (case-sensitive, no trim)
 *   - Empty array → 200 {accepted:0, rejected:0}
 *   - Non-array body → HTTP 400 {"message": "root should be array"}
 */
import { describe, it, expect } from "vitest";

// ── Config ─────────────────────────────────────────────────────────────────

const BASE_URL = process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz";
const TENANT_ID = process.env.CDP_TENANT_ID || "1762934640267";
const INGEST_URL = `${BASE_URL}/cdp-ingest/ingest/tenant/${TENANT_ID}/async/events`;

/** Base primary_id offset — large enough to avoid collisions with customer ingest tests */
const BASE_ID = 9_900_000_000_000;

let _idSeq = 0;
const nextId = () => BASE_ID + (++_idSeq);

/** Known active event type name on the shared tenant — has required field item_id (BIGINT) */
const VALID_EVENT_TYPE = "add_to_cart";

/**
 * Minimum valid event for "add_to_cart" (primary_id + event_type + item_id).
 * item_id is a required BIGINT field on this event type.
 */
const MIN_VALID = (overrides: Record<string, unknown> = {}) => ({
  primary_id: nextId(),
  event_type: VALID_EVENT_TYPE,
  item_id: 1,
  ...overrides,
});

/**
 * Minimum valid event for "purchase" — no extra required fields beyond primary_id + event_type.
 */
const MIN_VALID_PURCHASE = (overrides: Record<string, unknown> = {}) => ({
  primary_id: nextId(),
  event_type: "purchase",
  ...overrides,
});

async function ingest(body: unknown, contentType: string | null = "application/json") {
  let rawBody: string | undefined;
  if (body !== undefined) {
    rawBody = typeof body === "string" ? body : JSON.stringify(body);
  }
  const headers: Record<string, string> = {};
  if (contentType) headers["Content-Type"] = contentType;

  const res = await fetch(INGEST_URL, { method: "POST", headers, body: rawBody });

  let data: any;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = text; }

  return { status: res.status, data };
}

// ── 1. Empty Array ─────────────────────────────────────────────────────────

describe("Event Ingest — Empty / Trivial Inputs", () => {
  it("1. Empty array [] — accepted as no-op batch (0 accepted, 0 rejected)", async () => {
    const { status, data } = await ingest([]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(0);
    expect(data.rejected).toBe(0);
    expect(data.items).toHaveLength(0);
  });

  it("10. Empty object [{}] — rejected at item level (no primary_id or event_type)", async () => {
    const { status, data } = await ingest([{}]);
    expect(status).toBe(200);
    expect(data.rejected).toBe(1);
    expect(data.items[0].status).toBe("rejected");
  });
});

// ── 2. Valid Baseline ──────────────────────────────────────────────────────

describe("Event Ingest — Valid Baseline", () => {
  it("2. Single valid event — primary_id + event_type 'add_to_cart'", async () => {
    const { status, data } = await ingest([MIN_VALID()]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
    expect(data.items[0].status).toBe("accepted");
  });
});

// ── 3. Non-existent event_type ─────────────────────────────────────────────

describe("Event Ingest — event_type Validation", () => {
  it("3. Non-existent event_type — should reject (unknown type not in tenant schema)", async () => {
    const { status, data } = await ingest([MIN_VALID({ event_type: "completely_nonexistent_type_xyz" })]);
    expect(status).toBe(200);
    // Expectation: rejected because the event type doesn't exist for this tenant.
    // If accepted, it reveals that event_type is not validated server-side.
    expect(data.rejected).toBe(1);
    expect(data.items[0].status).toBe("rejected");
  });

  it("4. Missing event_type — rejected (required field)", async () => {
    const { status, data } = await ingest([{ primary_id: nextId(), item_id: 1 }]);
    expect(status).toBe(200);
    expect(data.rejected).toBe(1);
    expect(data.items[0].status).toBe("rejected");
  });

  it("6a. Null event_type — rejected (null is not a valid event type name)", async () => {
    const { status, data } = await ingest([MIN_VALID({ event_type: null })]);
    expect(status).toBe(200);
    expect(data.rejected).toBe(1);
    expect(data.items[0].status).toBe("rejected");
  });

  it("6b. Empty string event_type — what happens? ('' should not match any type)", async () => {
    const { status, data } = await ingest([MIN_VALID({ event_type: "" })]);
    expect(status).toBe(200);
    // Empty string likely treated as missing — expect rejection.
    // Mark as observation if accepted (reveals loose validation).
    expect(data.rejected).toBe(1);
  });

  it("7. Numeric event_type (ID 102 = add_to_cart, instead of name string) — observe behavior", async () => {
    // 102 is the numeric ID for "add_to_cart". Does the API accept IDs in lieu of names?
    const { status, data } = await ingest([MIN_VALID({ event_type: 102 })]);
    expect(status).toBe(200);
    // Either accepted (numeric ID coercion) or rejected (name-only validation).
    // Both are valid outcomes — this records the actual behavior.
    expect([0, 1]).toContain(data.accepted);
  });

  it("13. Extremely long event_type name (500 chars) — observe behavior", async () => {
    const longType = "a".repeat(500);
    const { status, data } = await ingest([MIN_VALID({ event_type: longType })]);
    expect(status).toBe(200);
    // Long unknown name → should reject (no such type exists). Server must not crash.
    expect(data.items[0].status).toBe("rejected");
  });

  it("14. SQL injection in event_type — accepted or rejected, must not crash/500", async () => {
    const { status, data } = await ingest([MIN_VALID({ event_type: "'; DROP TABLE events; --" })]);
    // No 500 — parameterized queries should protect the DB.
    expect(status).toBe(200);
    // Unknown type name → rejected at item level.
    expect(data.rejected).toBe(1);
  });
});

// ── 5. Missing primary_id ──────────────────────────────────────────────────

describe("Event Ingest — primary_id Boundary Cases", () => {
  it("5. Missing primary_id — rejected (required field)", async () => {
    const { status, data } = await ingest([{ event_type: VALID_EVENT_TYPE, item_id: 1 }]);
    expect(status).toBe(200);
    expect(data.rejected).toBe(1);
    expect(data.items[0].status).toBe("rejected");
  });

  it("20. Negative primary_id — observe behavior (customer ingest accepts, events may differ)", async () => {
    const { status, data } = await ingest([MIN_VALID({ primary_id: -1 })]);
    expect(status).toBe(200);
    // Customer ingest accepts negatives (BUG-documented). Events might too.
    // Record the actual behavior without strong assertion on accept/reject.
    expect(data.items).toHaveLength(1);
  });
});

// ── 8. Duplicate events in same batch ────────────────────────────────────

describe("Event Ingest — Duplicate Events in Same Batch", () => {
  it("8. Two identical events in one batch — both accepted (events are append-only)", async () => {
    const sharedId = nextId();
    const { status, data } = await ingest([
      { primary_id: sharedId, event_type: VALID_EVENT_TYPE, item_id: 1 },
      { primary_id: sharedId, event_type: VALID_EVENT_TYPE, item_id: 1 },
    ]);
    expect(status).toBe(200);
    // Events are time-series data — duplicates should be accepted (not deduped).
    expect(data.accepted).toBe(2);
    expect(data.rejected).toBe(0);
  });
});

// ── 9. Extra unknown fields ───────────────────────────────────────────────

describe("Event Ingest — Unknown / Extra Fields", () => {
  it("9. Event with extra unknown fields — accepted, unknown fields ignored or reported", async () => {
    const { status, data } = await ingest([
      MIN_VALID({ totally_unknown_field: "hello", another_mystery: 42 }),
    ]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
    // Parallel to customer ingest: unknowns appear in ignoredFields (if that pattern applies)
    // or silently discarded. Either is acceptable — no crash, no reject.
  });
});

// ── 11. Non-array body ────────────────────────────────────────────────────

describe("Event Ingest — Non-Array Body", () => {
  it("11a. Plain object — HTTP 400 'root should be array'", async () => {
    const { status, data } = await ingest({ primary_id: nextId(), event_type: VALID_EVENT_TYPE });
    expect(status).toBe(400);
    expect(data.message).toMatch(/array/i);
  });

  it("11b. String body — HTTP 400", async () => {
    const { status } = await ingest('"just a string"');
    expect(status).toBe(400);
  });

  it("11c. Number body — HTTP 400", async () => {
    const { status } = await ingest("12345");
    expect(status).toBe(400);
  });

  it("11d. Null body — HTTP 400", async () => {
    const { status } = await ingest("null");
    expect(status).toBe(400);
  });
});

// ── 12. Very large batch ──────────────────────────────────────────────────

describe("Event Ingest — Large Batch", () => {
  it("12. 100-event batch — all accepted (no batch size limit found)", async () => {
    const batch = Array.from({ length: 100 }, () => MIN_VALID());
    const { status, data } = await ingest(batch);
    expect(status).toBe(200);
    expect(data.accepted).toBe(100);
    expect(data.rejected).toBe(0);
  });
});

// ── 15. Very long string field values ────────────────────────────────────

describe("Event Ingest — Long String Field Values", () => {
  it("15. Very long string in extra field (10,000 chars) — must not crash", async () => {
    const { status, data } = await ingest([
      MIN_VALID({ notes: "X".repeat(10_000) }),
    ]);
    expect(status).toBe(200);
    // Either accepted (field stored or ignored) or rejected at item level.
    // A 500 would be a bug.
    expect(data.items).toHaveLength(1);
  });
});

// ── 16. Nested object field values ────────────────────────────────────────

describe("Event Ingest — Nested / Complex Field Values", () => {
  it("16. Nested object as extra field — accepted with field ignored, or rejected at item level", async () => {
    const { status, data } = await ingest([
      MIN_VALID({ metadata: { page: "cart", session: "abc123" } }),
    ]);
    expect(status).toBe(200);
    // Must not crash. Observation of ignoredFields or rejection is acceptable.
    expect(data.items).toHaveLength(1);
  });
});

// ── 17–19. Timestamp field variants ──────────────────────────────────────

describe("Event Ingest — Timestamp Field", () => {
  it("17a. ISO 8601 timestamp in 'timestamp' field — observe behavior", async () => {
    const { status, data } = await ingest([
      MIN_VALID({ timestamp: "2024-01-15T10:30:00Z" }),
    ]);
    expect(status).toBe(200);
    expect(data.items).toHaveLength(1);
  });

  it("17b. ISO 8601 with timezone offset — observe behavior", async () => {
    const { status, data } = await ingest([
      MIN_VALID({ timestamp: "2024-01-15T12:30:00+05:00" }),
    ]);
    expect(status).toBe(200);
    expect(data.items).toHaveLength(1);
  });

  it("17c. Date-only string 'YYYY-MM-DD' as timestamp — observe behavior", async () => {
    const { status, data } = await ingest([
      MIN_VALID({ timestamp: "2024-01-15" }),
    ]);
    expect(status).toBe(200);
    expect(data.items).toHaveLength(1);
  });

  it("18. Future timestamp (year 2099) — accepted (events from future date)", async () => {
    const { status, data } = await ingest([
      MIN_VALID({ timestamp: "2099-12-31T23:59:59Z" }),
    ]);
    expect(status).toBe(200);
    // No date range validation expected. A 500 would be a bug.
    expect(data.items).toHaveLength(1);
  });

  it("19. Unix epoch integer timestamp — observe behavior", async () => {
    // Some APIs accept epoch seconds/ms; others require ISO strings.
    const { status, data } = await ingest([
      MIN_VALID({ timestamp: 1705315800 }),  // 2024-01-15T10:30:00Z in Unix seconds
    ]);
    expect(status).toBe(200);
    expect(data.items).toHaveLength(1);
  });

  it("19b. Epoch 0 (Unix epoch, 1970-01-01) — must not crash", async () => {
    const { status, data } = await ingest([
      MIN_VALID({ timestamp: 0 }),
    ]);
    expect(status).toBe(200);
    expect(data.items).toHaveLength(1);
  });

  it("19c. Negative epoch timestamp — must not crash", async () => {
    const { status, data } = await ingest([
      MIN_VALID({ timestamp: -86400 }),  // one day before epoch
    ]);
    expect(status).toBe(200);
    expect(data.items).toHaveLength(1);
  });

  it("17d. Completely invalid timestamp string — observe behavior", async () => {
    const { status, data } = await ingest([
      MIN_VALID({ timestamp: "not-a-date-at-all" }),
    ]);
    expect(status).toBe(200);
    // Either rejected at item level or ignored — no 500.
    expect(data.items).toHaveLength(1);
  });
});
