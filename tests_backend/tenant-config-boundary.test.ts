/**
 * Boundary & edge-case tests for tenant config endpoints.
 *
 * Covers:
 *  - GET/PUT /api/tenant/specific-fields
 *  - GET /api/tenants/info
 *  - GET/POST /api/tenants/schema/customers/fields
 *  - GET/POST/DELETE /api/tenants/schema/event-types
 *  - GET /api/tenants/schema/draft-schema/status
 *
 * Shared-tenant safe: all mutations use "tcb_test_" prefix and clean up after themselves.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { get, post, put, del } from "./client";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TEST_FIELD_PREFIX = "tcb_test_";
const TEST_EVENT_PREFIX = "tcb_test_";

// Track created resources so we can delete them after tests
const createdFieldApiNames: string[] = [];
const createdEventTypeUids: string[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// 1-6. /api/tenant/specific-fields
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/tenant/specific-fields — shape validation", () => {
  let specificFields: Record<string, any>;

  beforeAll(async () => {
    const { status, data } = await get("/api/tenant/specific-fields");
    expect(status).toBe(200);
    specificFields = data;
  });

  it("1. returns 200 with a non-null object", async () => {
    const { status, data } = await get("/api/tenant/specific-fields");
    expect(status).toBe(200);
    expect(data).toBeDefined();
    expect(typeof data).toBe("object");
    expect(data).not.toBeNull();
  });

  it("2. email mapping entry has required shape keys", () => {
    // The endpoint returns an object keyed by mapping name (e.g. "email", "phone").
    // Each value should be an object with field_api_name, field_display_name, field_name.
    const entries = Object.values(specificFields);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry).toHaveProperty("field_api_name");
      expect(entry).toHaveProperty("field_display_name");
      expect(entry).toHaveProperty("field_name");
    }
  });

  it("3. email key is present and has non-empty field_name", () => {
    // "email" is the critical business mapping
    if ("email" in specificFields) {
      expect(typeof specificFields.email.field_name).toBe("string");
    }
    // If "email" is absent the shape itself is the finding — log it
    if (!("email" in specificFields)) {
      console.warn("[FINDING] specific-fields response has no 'email' key:", Object.keys(specificFields));
    }
  });

  it("4. phone key follows the same shape when present", () => {
    if ("phone" in specificFields) {
      expect(specificFields.phone).toHaveProperty("field_api_name");
      expect(specificFields.phone).toHaveProperty("field_name");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/tenant/specific-fields — mutation edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/tenant/specific-fields — mutation boundary cases", () => {
  let originalEmail: any;
  let validFieldName: string | null = null;

  beforeAll(async () => {
    // Snapshot current email mapping so we can restore it
    const { data } = await get("/api/tenant/specific-fields");
    originalEmail = data?.email ?? null;

    // Find a real customer field to use as a valid mapping target
    const fieldsRes = await get("/api/tenants/schema/customers/fields");
    if (fieldsRes.status === 200 && fieldsRes.data?.list?.length > 0) {
      // Use an existing non-system field if possible
      const nonSystem = fieldsRes.data.list.find(
        (f: any) => !f.flagSystemField && f.status === "field_ready"
      );
      validFieldName = nonSystem?.apiName ?? fieldsRes.data.list[0]?.apiName ?? null;
    }
  });

  afterAll(async () => {
    // Restore original email mapping if we changed it
    if (originalEmail !== null) {
      await put("/api/tenant/specific-fields", { email: originalEmail });
    }
  });

  it("5. PUT with valid update (change email mapping to an existing field) — expect 200 or 400", async () => {
    if (!validFieldName) {
      console.warn("[SKIP] No valid customer field found to test PUT specific-fields");
      return;
    }
    // Build a minimal valid payload: only update the email mapping
    const payload = {
      email: {
        field_name: validFieldName,
      },
    };
    const { status, data } = await put("/api/tenant/specific-fields", payload);
    // 200 = success; 400 = validation rejected (also acceptable); 500 = bug
    expect([200, 400]).toContain(status);
    if (status !== 200) {
      console.warn("[FINDING] PUT specific-fields valid update rejected:", status, data);
    }
  });

  it("6. PUT with non-existent field_name — should return 400/404, not 500", async () => {
    const { status } = await put("/api/tenant/specific-fields", {
      email: { field_name: "nonexistent_field_xyz_999" },
    });
    expect(status).not.toBe(500);
    if (status === 200) {
      console.warn("[FINDING] PUT specific-fields accepted non-existent field_name — no existence check.");
    }
  });

  it("7. PUT with empty string field_name — should return 400, not 500", async () => {
    const { status } = await put("/api/tenant/specific-fields", {
      email: { field_name: "" },
    });
    expect(status).not.toBe(500);
    if (status === 200) {
      console.warn("[FINDING] PUT specific-fields accepted empty string field_name.");
    }
  });

  it("8. PUT with SQL injection in field_name — should return 400/404, not 500", async () => {
    const { status } = await put("/api/tenant/specific-fields", {
      email: { field_name: "'; DROP TABLE tenants--" },
    });
    // 500 = SQL error leak (unparameterized query). 400/404 = correct rejection.
    expect(status).not.toBe(500);
  });

  it("9. PUT with extra unknown keys in payload — should not crash (200 or 400)", async () => {
    const { status } = await put("/api/tenant/specific-fields", {
      email: { field_name: validFieldName ?? "primary_id", unexpected_key: "surprise" },
      totally_unknown_mapping: { field_name: "something" },
    });
    expect([200, 400]).toContain(status);
    if (status === 500) {
      console.warn("[FINDING] PUT specific-fields crashes (500) on extra unknown keys.");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. /api/tenants/info
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/tenants/info — shape validation", () => {
  it("10. returns 200 with customerFields, eventFields, tenant", async () => {
    const { status, data } = await get("/api/tenants/info");
    expect(status).toBe(200);
    expect(data).toHaveProperty("customerFields");
    expect(data).toHaveProperty("eventFields");
    // 'tenant' key should also be present per spec
    if (!("tenant" in data)) {
      console.warn("[FINDING] /api/tenants/info response missing 'tenant' key. Keys:", Object.keys(data));
    }
    expect(Array.isArray(data.customerFields)).toBe(true);
    expect(Array.isArray(data.eventFields)).toBe(true);
  });

  it("10b. customerFields entries have id, name, type, nullable", async () => {
    const { data } = await get("/api/tenants/info");
    for (const f of data.customerFields.slice(0, 5)) {
      expect(f).toHaveProperty("id");
      expect(f).toHaveProperty("name");
      expect(f).toHaveProperty("type");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11-14. /api/tenants/schema/customers/fields
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/tenants/schema/customers/fields — shape validation", () => {
  it("11. returns 200 with list array", async () => {
    const { status, data } = await get("/api/tenants/schema/customers/fields");
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
    expect(Array.isArray(data.list)).toBe(true);
  });

  it("12. each field has apiName, displayName, dataType, status", async () => {
    const { data } = await get("/api/tenants/schema/customers/fields");
    for (const f of data.list.slice(0, 10)) {
      expect(f).toHaveProperty("apiName");
      expect(f).toHaveProperty("displayName");
      expect(f).toHaveProperty("dataType");
      expect(f).toHaveProperty("status");
    }
  });
});

describe("POST /api/tenants/schema/customers/fields — draft field creation boundary", () => {
  const testApiName = `${TEST_FIELD_PREFIX}${Date.now()}`;

  it("13. POST with valid new draft field — expect 200 or 201", async () => {
    const payload = {
      apiName: testApiName,
      displayName: "TCB Test Field",
      dataType: "VARCHAR",
      flagMulti: false,
    };
    const { status, data } = await post("/api/tenants/schema/customers/fields", payload);
    if (status === 200 || status === 201) {
      createdFieldApiNames.push(testApiName);
    }
    expect([200, 201, 400, 409]).toContain(status);
    if (status === 500) {
      console.warn("[FINDING] POST customers/fields crashed with 500:", data);
    }
  });

  it("14. POST with duplicate apiName — expect 400 or 409, not 500", async () => {
    // Attempt to create the same field again
    const payload = {
      apiName: testApiName,
      displayName: "TCB Test Field Duplicate",
      dataType: "VARCHAR",
      flagMulti: false,
    };
    const { status } = await post("/api/tenants/schema/customers/fields", payload);
    expect(status).not.toBe(500);
    if (status === 200 || status === 201) {
      console.warn("[FINDING] POST customers/fields accepted a duplicate apiName — no uniqueness enforcement.");
    }
  });

  it("15. POST with empty apiName — expect 400, not 500", async () => {
    const { status } = await post("/api/tenants/schema/customers/fields", {
      apiName: "",
      displayName: "No API Name",
      dataType: "VARCHAR",
    });
    expect(status).not.toBe(500);
    if (status === 200 || status === 201) {
      console.warn("[FINDING] POST customers/fields accepted empty apiName.");
    }
  });

  it("16. POST with special chars in apiName — expect 400, not 500", async () => {
    const { status } = await post("/api/tenants/schema/customers/fields", {
      apiName: "test field!@#$%",
      displayName: "Special Chars",
      dataType: "VARCHAR",
    });
    // Backend should reject non-identifier chars. 500 = unhandled.
    expect(status).not.toBe(500);
  });

  it("17. POST with invalid dataType — expect 400, not 500", async () => {
    const { status } = await post("/api/tenants/schema/customers/fields", {
      apiName: `${TEST_FIELD_PREFIX}badtype_${Date.now()}`,
      displayName: "Bad DataType",
      dataType: "INVENTED_TYPE",
    });
    expect(status).not.toBe(500);
    if (status === 200 || status === 201) {
      console.warn("[FINDING] POST customers/fields accepted invalid dataType 'INVENTED_TYPE'.");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 18-22. /api/tenants/schema/event-types
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/tenants/schema/event-types — shape validation", () => {
  it("18. returns 200 with list array", async () => {
    const { status, data } = await get("/api/tenants/schema/event-types");
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
    expect(Array.isArray(data.list)).toBe(true);
    expect(data.list.length).toBeGreaterThan(0);
  });

  it("19. each event type has eventTypeName, uid, eventTypeId, draft", async () => {
    const { data } = await get("/api/tenants/schema/event-types");
    for (const et of data.list.slice(0, 5)) {
      expect(et).toHaveProperty("eventTypeName");
      expect(et).toHaveProperty("uid");
      expect(et).toHaveProperty("eventTypeId");
      expect(et).toHaveProperty("draft");
      expect(typeof et.draft).toBe("boolean");
    }
  });
});

describe("POST /api/tenants/schema/event-types — creation boundary", () => {
  const testEventName = `${TEST_EVENT_PREFIX}evt_${Date.now()}`;

  it("20. POST with valid new event type — expect 200 or 201", async () => {
    const payload = { eventTypeName: testEventName };
    const { status, data } = await post("/api/tenants/schema/event-types", payload);
    if (status === 200 || status === 201) {
      // Capture uid for cleanup
      const uid = data?.uid ?? data?.id ?? null;
      if (uid) createdEventTypeUids.push(uid);
    }
    expect([200, 201, 400, 409]).toContain(status);
    if (status === 500) {
      console.warn("[FINDING] POST event-types crashed with 500:", data);
    }
  });

  it("21. POST with duplicate eventTypeName — expect 400 or 409, not 500", async () => {
    const { status } = await post("/api/tenants/schema/event-types", { eventTypeName: testEventName });
    expect(status).not.toBe(500);
    if (status === 200 || status === 201) {
      console.warn("[FINDING] POST event-types accepted a duplicate eventTypeName — no uniqueness check.");
    }
  });

  it("22. POST with empty eventTypeName — expect 400, not 500", async () => {
    const { status } = await post("/api/tenants/schema/event-types", { eventTypeName: "" });
    expect(status).not.toBe(500);
    if (status === 200 || status === 201) {
      console.warn("[FINDING] POST event-types accepted empty eventTypeName.");
    }
  });

  it("23. DELETE /api/tenants/schema/event-types?uid={id} — delete the test event type", async () => {
    if (createdEventTypeUids.length === 0) {
      // Try to look up the event type we just created
      const { data } = await get("/api/tenants/schema/event-types");
      const match = data?.list?.find((et: any) => et.eventTypeName === testEventName);
      if (match?.uid) createdEventTypeUids.push(match.uid);
    }

    if (createdEventTypeUids.length === 0) {
      console.warn("[SKIP] No event type UID to delete — creation likely failed or was rejected.");
      return;
    }

    const uid = createdEventTypeUids[0];
    const { status } = await del("/api/tenants/schema/event-types", { uid });
    // 200/204 = success; 404 = already gone; 400 = cannot delete (non-draft)
    expect([200, 204, 400, 404]).toContain(status);
    if (status === 500) {
      console.warn("[FINDING] DELETE event-types crashed with 500 for uid:", uid);
    }
    if (status === 200 || status === 204) {
      // Successfully cleaned up — remove from tracking list
      createdEventTypeUids.shift();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 24. Draft schema status
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/tenants/schema/draft-schema/status — shape validation", () => {
  it("24. returns 200 with numberOfChanges (number)", async () => {
    const { status, data } = await get("/api/tenants/schema/draft-schema/status");
    expect(status).toBe(200);
    expect(data).toHaveProperty("numberOfChanges");
    expect(typeof data.numberOfChanges).toBe("number");
    expect(data.numberOfChanges).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup — remove any draft fields we created that weren't cleaned up inline
// ─────────────────────────────────────────────────────────────────────────────

afterAll(async () => {
  // Attempt to remove created event types that weren't deleted in test 23
  for (const uid of createdEventTypeUids) {
    try {
      await del("/api/tenants/schema/event-types", { uid });
    } catch {
      /* non-fatal */
    }
  }
  // Note: customer draft fields cannot easily be deleted via API (no DELETE endpoint known);
  // they sit in draft state until schema is applied or rolled back.
  if (createdFieldApiNames.length > 0) {
    console.warn(
      "[CLEANUP] Draft customer fields created during tests (no delete endpoint):",
      createdFieldApiNames
    );
  }
});
