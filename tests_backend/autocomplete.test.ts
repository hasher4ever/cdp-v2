/**
 * Autocomplete endpoint tests.
 *
 * Endpoint: GET /api/tenant/data/autocomplete/field-values
 * Query params: table (customers|events), field (internal col name), value (search prefix, required),
 *               size (number), event_type (events table only)
 *
 * Key findings from probe:
 *  - Internal field names use the pattern "col__varchar_s50000__N" (not "col__varchar__N")
 *  - value="" is rejected with 400 — non-empty prefix is required
 *  - Response shape: { list: string[] }
 *
 * BUG-001: GET with table=events AND event_type param → 500
 *          "Unknown column 'event_type' in 'table list'" (SQL error in compute layer)
 *          WITHOUT event_type → 200 (works, returns empty list for events)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { get } from "./client";

/** Autocomplete helper — wraps the endpoint with typed params */
function autocomplete(params: {
  table?: string;
  field?: string;
  value?: string;
  size?: number;
  event_type?: string;
}) {
  const p: Record<string, string | number | boolean | undefined> = {};
  if (params.table !== undefined) p.table = params.table;
  if (params.field !== undefined) p.field = params.field;
  if (params.value !== undefined) p.value = params.value;
  if (params.size !== undefined) p.size = params.size;
  if (params.event_type !== undefined) p.event_type = params.event_type;
  return get("/api/tenant/data/autocomplete/field-values", p);
}

describe("Autocomplete — /api/tenant/data/autocomplete/field-values", () => {
  // Dynamically discover a varchar customer field from the schema
  let varcharField: string = "col__varchar_s50000__1"; // fallback known to work

  beforeAll(async () => {
    const { status, data } = await get("/api/tenants/schema/internal/customers/fields/info");
    if (status === 200 && data?.fields && Array.isArray(data.fields)) {
      const field = data.fields.find((f: any) => f.type === "varchar" && f.state === "present");
      if (field?.name) varcharField = field.name;
    }
  });

  // ─── Baseline control: customer autocomplete ──────────────────────────────

  describe("Customer autocomplete (baseline control)", () => {
    it("Hypothesis: customer autocomplete with a valid varchar field and short prefix returns 200 with a list", async () => {
      // table=customers with a real varchar field should work end-to-end.
      const { status, data } = await autocomplete({
        table: "customers",
        field: varcharField,
        value: "a",
        size: 5,
      });
      expect(status).toBe(200);
      expect(data).toHaveProperty("list");
      expect(Array.isArray(data.list)).toBe(true);
    });

    it("Hypothesis: customer autocomplete with non-matching prefix returns 200 with empty list (not an error)", async () => {
      // Backend should do a prefix match and return [] when nothing matches.
      const { status, data } = await autocomplete({
        table: "customers",
        field: varcharField,
        value: "ZZZZZZZ_NO_MATCH_99999",
        size: 5,
      });
      expect(status).toBe(200);
      expect(data).toHaveProperty("list");
      expect(data.list).toHaveLength(0);
    });

    it("Hypothesis: size param caps the returned list length", async () => {
      const size = 3;
      const { status, data } = await autocomplete({
        table: "customers",
        field: varcharField,
        value: "a",
        size,
      });
      expect(status).toBe(200);
      expect(Array.isArray(data.list)).toBe(true);
      expect(data.list.length).toBeLessThanOrEqual(size);
    });

    it("Hypothesis: size=10000 is accepted and returns results (backend caps internally)", async () => {
      // Backend does not validate size upper bound — returns whatever it computes.
      const { status, data } = await autocomplete({
        table: "customers",
        field: varcharField,
        value: "a",
        size: 10000,
      });
      expect(status).toBe(200);
      expect(Array.isArray(data.list)).toBe(true);
    });

    it("Hypothesis: size=0 returns 200 with empty list (not an error)", async () => {
      // Requesting zero results should be a no-op, not a crash.
      const { status, data } = await autocomplete({
        table: "customers",
        field: varcharField,
        value: "a",
        size: 0,
      });
      expect(status).toBe(200);
      expect(data.list).toHaveLength(0);
    });
  });

  // ─── BUG-001: Event autocomplete SQL error with event_type param ───────────

  describe("Event autocomplete — BUG-001 regression guard", () => {
    it(
      "Hypothesis: event autocomplete WITHOUT event_type returns 200 (events path works when event_type is absent)", // BUG-001
      async () => {
        // Without event_type the compute layer does NOT inject the broken column ref,
        // so the query succeeds (returns empty list — events table may have no matching data).
        const { status, data } = await autocomplete({
          table: "events",
          field: varcharField,
          value: "a",
          size: 5,
          // Deliberately NO event_type
        });
        expect(status).toBe(200);
        expect(data).toHaveProperty("list");
        expect(Array.isArray(data.list)).toBe(true);
      }
    );

    it(
      "Hypothesis: event autocomplete WITH event_type returns 500 (BUG-001 — SQL 'Unknown column event_type in table list')", // BUG-001
      async () => {
        // The event_type param triggers a broken SQL code path in ComputeService.
        // Error: "Error 1054 (42S22): errCode = 2, detailMessage = Unknown column 'event_type' in 'table list'"
        // When BUG-001 is fixed, this test will fail — update expectation to 200.
        const { status } = await autocomplete({
          table: "events",
          field: varcharField,
          value: "a",
          size: 5,
          event_type: "purchase",
        });
        expect(status).toBe(500); // BUG-001
      }
    );
  });

  // ─── Request validation — missing/invalid params ──────────────────────────

  describe("Request validation — invalid inputs", () => {
    it("Hypothesis: missing table param returns 400 (OpenAPI required param enforcement)", async () => {
      const { status } = await autocomplete({
        field: varcharField,
        value: "a",
        size: 5,
        // No table
      });
      expect(status).toBe(400);
    });

    it("Hypothesis: invalid table value returns 400 (OpenAPI enum enforcement)", async () => {
      // Only 'customers' and 'events' are valid enum values per the OpenAPI spec.
      const { status } = await autocomplete({
        table: "segments",
        field: varcharField,
        value: "a",
        size: 5,
      });
      expect(status).toBe(400);
    });

    it("Hypothesis: missing field param returns 400 (OpenAPI required param enforcement)", async () => {
      const { status } = await autocomplete({
        table: "customers",
        value: "a",
        size: 5,
        // No field
      });
      expect(status).toBe(400);
    });

    it("Hypothesis: empty value string returns 400 (OpenAPI non-empty string enforcement)", async () => {
      // The OpenAPI spec requires a non-empty value — empty string is rejected.
      const { status } = await autocomplete({
        table: "customers",
        field: varcharField,
        value: "",
        size: 5,
      });
      expect(status).toBe(400);
    });

    it("Hypothesis: non-existent field name returns 409 with code 4 ('field not found')", async () => {
      // Backend looks up the field in the tenant schema; unknown names → 409 code 4.
      const { status, data } = await autocomplete({
        table: "customers",
        field: "col__nonexistent_field_xyz_999",
        value: "a",
        size: 5,
      });
      expect(status).toBe(409);
      expect(data?.code).toBe(4);
      expect(data?.description).toMatch(/field not found/i);
    });

    it("Hypothesis: non-varchar field (bigint) returns 409 with code 20 ('field type is not VARCHAR')", async () => {
      // Autocomplete only supports VARCHAR fields — using a bigint field is rejected.
      const { status, data } = await autocomplete({
        table: "customers",
        field: "col__bigint__0",
        value: "a",
        size: 5,
      });
      expect(status).toBe(409);
      expect(data?.code).toBe(20);
      expect(data?.description).toMatch(/not VARCHAR/i);
    });
  });
});
