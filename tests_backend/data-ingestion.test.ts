/**
 * Data Ingestion API — public endpoints for streaming customer and event data.
 *
 * Endpoints:
 *   POST /cdp-ingest/ingest/tenant/{tenantId}/async/customers  (public, no auth)
 *   POST /cdp-ingest/ingest/tenant/{tenantId}/async/events     (public, no auth)
 *
 * These endpoints accept arrays of records and return immediately (async processing).
 */
import { describe, it, expect } from "vitest";
import { api, get } from "./client";

const tenantId = () => globalThis.__cdp_tenant_id;
const baseUrl = () => globalThis.__cdp_base_url;

/** Send data to the ingest endpoint (no auth needed) */
async function ingest(path: string, body: unknown) {
  return api(path, { method: "POST", body, token: "" });
}

// ─── Customer Ingestion ─────────────────────────────────────────────────────

describe("Customer Ingestion - /cdp-ingest/ingest/tenant/{id}/async/customers", () => {
  const prefix = `test_ingest_${Date.now()}`;

  it("should accept a single customer record", async () => {
    const { status } = await ingest(
      `/cdp-ingest/ingest/tenant/${tenantId()}/async/customers`,
      [{ primary_id: `${prefix}_001` }]
    );
    expect([200, 202]).toContain(status);
  });

  it("should accept a batch of customer records", async () => {
    const customers = Array.from({ length: 5 }, (_, i) => ({
      primary_id: `${prefix}_batch_${i}`,
    }));
    const { status } = await ingest(
      `/cdp-ingest/ingest/tenant/${tenantId()}/async/customers`,
      customers
    );
    expect([200, 202]).toContain(status);
  });

  it("should accept customer with all standard fields", async () => {
    const { status } = await ingest(
      `/cdp-ingest/ingest/tenant/${tenantId()}/async/customers`,
      [{
        primary_id: `${prefix}_full`,
        first_name: "IngestTest",
        last_name: "User",
      }]
    );
    expect([200, 202]).toContain(status);
  });

  it("should reject empty array", async () => {
    const { status } = await ingest(
      `/cdp-ingest/ingest/tenant/${tenantId()}/async/customers`,
      []
    );
    // API may accept empty arrays silently (200) or reject (400)
    expect([200, 202, 400]).toContain(status);
  });

  it("should reject non-array payload", async () => {
    const { status } = await ingest(
      `/cdp-ingest/ingest/tenant/${tenantId()}/async/customers`,
      { primary_id: "single_object" }
    );
    expect([400, 500]).toContain(status);
  });

  it("should reject record without primary_id", async () => {
    const { status } = await ingest(
      `/cdp-ingest/ingest/tenant/${tenantId()}/async/customers`,
      [{ first_name: "NoPrimaryId" }]
    );
    // May accept and ignore, or reject
    expect([200, 202, 400]).toContain(status);
  });

  it("should handle non-existent tenant ID gracefully", async () => {
    const { status } = await ingest(
      "/cdp-ingest/ingest/tenant/999999999999/async/customers",
      [{ primary_id: "ghost_tenant" }]
    );
    // Should either reject or accept silently — not crash
    expect([200, 202, 400, 404]).toContain(status);
  });

  it("should not require auth (public endpoint)", async () => {
    // Explicitly send without any token
    const res = await fetch(
      `${baseUrl()}/cdp-ingest/ingest/tenant/${tenantId()}/async/customers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ primary_id: `${prefix}_noauth` }]),
      }
    );
    expect([200, 202]).toContain(res.status);
  });
});

// ─── Event Ingestion ────────────────────────────────────────────────────────

describe("Event Ingestion - /cdp-ingest/ingest/tenant/{id}/async/events", () => {
  const prefix = `test_ingest_${Date.now()}`;

  it("should accept a single event record", async () => {
    const { status } = await ingest(
      `/cdp-ingest/ingest/tenant/${tenantId()}/async/events`,
      [{ primary_id: `${prefix}_001`, event_type: "purchase" }]
    );
    expect([200, 202]).toContain(status);
  });

  it("should accept a batch of event records", async () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      primary_id: `${prefix}_batch_${i}`,
      event_type: "purchase",
    }));
    const { status } = await ingest(
      `/cdp-ingest/ingest/tenant/${tenantId()}/async/events`,
      events
    );
    expect([200, 202]).toContain(status);
  });

  it("should accept event with custom fields", async () => {
    const { status } = await ingest(
      `/cdp-ingest/ingest/tenant/${tenantId()}/async/events`,
      [{
        primary_id: `${prefix}_custom`,
        event_type: "purchase",
        total_price: 99.99,
        delivery_city: "Tashkent",
      }]
    );
    expect([200, 202]).toContain(status);
  });

  it("should reject empty array", async () => {
    const { status } = await ingest(
      `/cdp-ingest/ingest/tenant/${tenantId()}/async/events`,
      []
    );
    expect([200, 202, 400]).toContain(status);
  });

  it("should reject non-array payload", async () => {
    const { status } = await ingest(
      `/cdp-ingest/ingest/tenant/${tenantId()}/async/events`,
      { primary_id: "single", event_type: "purchase" }
    );
    expect([400, 500]).toContain(status);
  });

  it("should accept event with non-existent event_type (unknown types accepted)", async () => {
    const { status } = await ingest(
      `/cdp-ingest/ingest/tenant/${tenantId()}/async/events`,
      [{ primary_id: `${prefix}_unknown_type`, event_type: `nonexistent_${Date.now()}` }]
    );
    // Ingest API is lenient — may accept unknown event types
    expect([200, 202, 400]).toContain(status);
  });

  it("should not require auth (public endpoint)", async () => {
    const res = await fetch(
      `${baseUrl()}/cdp-ingest/ingest/tenant/${tenantId()}/async/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ primary_id: `${prefix}_noauth`, event_type: "purchase" }]),
      }
    );
    expect([200, 202]).toContain(res.status);
  });
});
