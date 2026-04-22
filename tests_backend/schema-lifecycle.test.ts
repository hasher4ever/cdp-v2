/**
 * Schema Draft Lifecycle — create field → check status → apply/cancel.
 *
 * Tests the draft-schema endpoints that manage schema change staging:
 *   GET    /api/tenants/schema/draft-schema/status   → pending change count
 *   POST   /api/tenants/schema/draft-schema/apply    → apply all drafts
 *   DELETE /api/tenants/schema/draft-schema/cancel   → discard all drafts
 *
 * Also tests creating and deleting draft customer fields and event types.
 */
import { describe, it, expect } from "vitest";
import { get, post, put, del } from "./client";

// ─── Draft Schema Status ────────────────────────────────────────────────────

describe("Draft Schema Status - /api/tenants/schema/draft-schema/status", () => {
  it("should return numberOfChanges as a number", async () => {
    const { status, data } = await get("/api/tenants/schema/draft-schema/status");
    expect(status).toBe(200);
    expect(data).toHaveProperty("numberOfChanges");
    expect(typeof data.numberOfChanges).toBe("number");
    expect(data.numberOfChanges).toBeGreaterThanOrEqual(0);
  });
});

// ─── Draft Cancel ───────────────────────────────────────────────────────────

describe("Draft Schema Cancel - /api/tenants/schema/draft-schema/cancel", () => {
  it("should cancel pending drafts (idempotent even with 0 changes)", async () => {
    const { status } = await del("/api/tenants/schema/draft-schema/cancel");
    // Should succeed even if there are no pending changes
    expect([200, 204]).toContain(status);
  });

  it("should have 0 changes after cancel", async () => {
    const { status, data } = await get("/api/tenants/schema/draft-schema/status");
    expect(status).toBe(200);
    expect(data.numberOfChanges).toBe(0);
  });
});

// ─── Customer Field Draft Create + Cancel ───────────────────────────────────

describe("Customer Field: draft create + cancel", () => {
  const ts = Date.now();
  const apiName = `test_draft_cancel_${ts}`;

  it("should create a draft customer field", async () => {
    const { status, data } = await post("/api/tenants/schema/customers/fields", {
      apiName,
      displayName: `Draft Cancel Test ${ts}`,
      dataType: "VARCHAR",
      flagMulti: false,
      access: "field_optional",
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("ID");
  });

  it("should show at least 1 pending change", async () => {
    const { status, data } = await get("/api/tenants/schema/draft-schema/status");
    expect(status).toBe(200);
    expect(data.numberOfChanges).toBeGreaterThanOrEqual(1);
  });

  it("should cancel the draft", async () => {
    const { status } = await del("/api/tenants/schema/draft-schema/cancel");
    expect([200, 204]).toContain(status);
  });

  it("should have 0 pending changes after cancel", async () => {
    const { data } = await get("/api/tenants/schema/draft-schema/status");
    expect(data.numberOfChanges).toBe(0);
  });

  it("should not list the cancelled field", async () => {
    const { data } = await get("/api/tenants/schema/customers/fields", { exclude_draft: true });
    const found = data.list.find((f: any) => f.apiName === apiName);
    expect(found).toBeUndefined();
  });
});

// ─── Customer Field Draft Create + Apply ────────────────────────────────────

describe("Customer Field: draft create + apply", () => {
  const ts = Date.now();
  const apiName = `test_draft_apply_${ts}`;

  it("should start with 0 pending changes", async () => {
    // Clean up any leftover drafts
    await del("/api/tenants/schema/draft-schema/cancel");
    const { data } = await get("/api/tenants/schema/draft-schema/status");
    expect(data.numberOfChanges).toBe(0);
  });

  it("should create a draft customer field", async () => {
    const { status, data } = await post("/api/tenants/schema/customers/fields", {
      apiName,
      displayName: `Draft Apply Test ${ts}`,
      dataType: "VARCHAR",
      flagMulti: false,
      access: "field_optional",
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("ID");
  });

  it("should apply the draft", async () => {
    const { status } = await post("/api/tenants/schema/draft-schema/apply");
    expect([200, 204]).toContain(status);
  });

  it("should have 0 pending changes after apply", async () => {
    const { data } = await get("/api/tenants/schema/draft-schema/status");
    expect(data.numberOfChanges).toBe(0);
  });

  it("should list the applied field in live fields", async () => {
    const { data } = await get("/api/tenants/schema/customers/fields", { exclude_draft: true });
    const found = data.list.find((f: any) => f.apiName === apiName);
    expect(found).toBeDefined();
    // Status after apply can be "field_not_ready" or "field_ready" depending on compute availability
    expect(["field_not_ready", "field_ready"]).toContain(found.status);
  });
});

// ─── Event Type Draft Create + Delete ───────────────────────────────────────

describe("Event Type: draft lifecycle", () => {
  const ts = Date.now();
  let eventTypeUid: string;

  it("should create a draft event type", async () => {
    // Cancel any existing drafts first
    await del("/api/tenants/schema/draft-schema/cancel");

    const name = `test_event_${ts}`.substring(0, 50);
    const { status, data } = await post("/api/tenants/schema/event-types", { name });
    if (status === 409) {
      console.warn("Event type name conflict — skipping");
      return;
    }
    expect(status).toBe(200);
    expect(data).toHaveProperty("ID");
    eventTypeUid = data.ID;
  });

  it("should appear in event types list (including drafts)", async () => {
    if (!eventTypeUid) return;
    const { data } = await get("/api/tenants/schema/event-types", { exclude_draft: false });
    const found = data.list.find((et: any) => et.uid === eventTypeUid || et.ID === eventTypeUid);
    expect(found).toBeDefined();
    expect(found.draft).toBe(true);
  });

  it("should delete the draft event type", async () => {
    if (!eventTypeUid) return;
    const { status } = await del("/api/tenants/schema/event-types", { id: eventTypeUid });
    expect([200, 204]).toContain(status);
  });

  it("should not appear in event types after deletion", async () => {
    if (!eventTypeUid) return;
    const { data } = await get("/api/tenants/schema/event-types", { exclude_draft: false });
    const found = data.list.find((et: any) => et.uid === eventTypeUid || et.ID === eventTypeUid);
    expect(found).toBeUndefined();
  });
});

// ─── Customer Field Delete (Draft) ──────────────────────────────────────────

describe("Customer Field: delete draft field", () => {
  const ts = Date.now();
  let fieldId: string;

  it("should create a draft field", async () => {
    await del("/api/tenants/schema/draft-schema/cancel");
    const { status, data } = await post("/api/tenants/schema/customers/fields", {
      apiName: `test_del_field_${ts}`,
      displayName: `Delete Test ${ts}`,
      dataType: "BIGINT",
      flagMulti: false,
      access: "field_optional",
    });
    expect(status).toBe(200);
    fieldId = data.ID;
  });

  it("should delete the draft field", async () => {
    if (!fieldId) return;
    const { status } = await del("/api/tenants/schema/customers/fields", { field_id: fieldId });
    expect([200, 204]).toContain(status);
  });

  it("should not appear in fields list after delete", async () => {
    const { data } = await get("/api/tenants/schema/customers/fields", { exclude_draft: false });
    const found = data.list.find((f: any) => f.id === fieldId);
    expect(found).toBeUndefined();
  });
});

// ─── Event Field Draft Lifecycle ────────────────────────────────────────────

describe("Event Field: draft lifecycle", () => {
  let eventTypeId: number;
  let fieldId: string;
  const ts = Date.now();

  it("should get an existing event type to add a field to", async () => {
    const { data } = await get("/api/tenants/schema/event-types", { exclude_draft: true });
    expect(data.list.length).toBeGreaterThan(0);
    eventTypeId = data.list[0].eventTypeId;
  });

  it("should create a draft event field", async () => {
    if (!eventTypeId) return;
    const { status, data } = await post(`/api/tenants/schema/events/fields/${eventTypeId}`, {
      apiName: `test_evt_field_${ts}`,
      displayName: `Event Field ${ts}`,
      dataType: "DOUBLE",
      flagMulti: false,
      access: "field_optional",
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("ID");
    fieldId = data.ID;
  });

  it("should list the draft event field", async () => {
    if (!eventTypeId) return;
    const { data } = await get(`/api/tenants/schema/events/fields/${eventTypeId}`, { exclude_draft: false });
    const found = data.list.find((f: any) => f.id === fieldId);
    expect(found).toBeDefined();
  });

  it("should delete the draft event field", async () => {
    if (!eventTypeId || !fieldId) return;
    const { status } = await del(`/api/tenants/schema/events/fields/${eventTypeId}`, { field_id: fieldId });
    expect([200, 204]).toContain(status);
  });
});
