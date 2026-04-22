/**
 * Boundary & edge-case tests for the unauthenticated customer ingestion endpoint.
 *
 * POST /cdp-ingest/ingest/tenant/{tenantId}/async/customers
 *
 * This endpoint is unauthenticated — no Bearer token needed.
 * The shared tenant has three required fields beyond primary_id:
 *   - api_customer_name_first  (internal key for first name)
 *   - api_customer_name_last   (internal key for last name — separate required field)
 *   - last_name                (another last name field, also required)
 *
 * Response shape is always HTTP 200 with per-item accept/reject status:
 *   { accepted: N, rejected: M, items: [{ status: "accepted"|"rejected", error?, ignoredFields? }] }
 *
 * Key findings discovered during reconnaissance:
 *  - String primary_id is silently coerced to integer (ACCEPTED)
 *  - Boolean primary_id (true/false) is silently coerced (ACCEPTED)
 *  - Negative primary_id is accepted (no range validation)
 *  - Zero primary_id is accepted
 *  - Duplicate primary_ids in same batch: BOTH accepted (last-write-wins upsert, no dedup)
 *  - Empty string required field: ACCEPTED (null is rejected, "" is not)
 *  - 10k-char string field: ACCEPTED (no length cap)
 *  - Null bytes in field value: ACCEPTED (stored as-is)
 *  - Unknown fields: ACCEPTED with ignoredFields list reported
 *  - Nested objects as field values: ACCEPTED then silently ignored (listed in ignoredFields)
 *  - SQL injection string: ACCEPTED (parameterized queries protect DB)
 *  - 1000-item batch: ACCEPTED in single request (no batch size limit found)
 *  - Non-array body: returns HTTP 400 {"message":"root should be array"}
 *  - Malformed JSON: returns HTTP 400 with parse error message
 *  - Object primary_id: rejected at item level (not HTTP 400)
 *  - Array as field value: rejected with "invalid number"
 */
import { describe, it, expect } from "vitest";

// ── Config ─────────────────────────────────────────────────────────────────

const BASE_URL = process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz";
const TENANT_ID = process.env.CDP_TENANT_ID || "1762934640267";
const INGEST_URL = `${BASE_URL}/cdp-ingest/ingest/tenant/${TENANT_ID}/async/customers`;

/** Base primary_id offset — large enough to avoid collisions with other test data */
const BASE_ID = 8_800_000_000_000;

/** Counter for unique IDs within this file */
let _idSeq = 0;
const nextId = () => BASE_ID + (++_idSeq);

/**
 * Minimum valid customer record for this tenant.
 * Merge extra fields on top to build variant payloads.
 */
const MIN_VALID = (overrides: Record<string, unknown> = {}) => ({
  primary_id: nextId(),
  api_customer_name_first: "BoundaryFirst",
  api_customer_name_last: "BoundaryLast",
  last_name: "BoundaryLast2",
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

// ── 1. Empty / Trivial Inputs ──────────────────────────────────────────────

describe("Ingest — Empty / Trivial Inputs", () => {
  it("1. Empty array [] — accepted as no-op batch", async () => {
    const { status, data } = await ingest([]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(0);
    expect(data.rejected).toBe(0);
    expect(data.items).toHaveLength(0);
  });

  it("8. Single empty object [{}] — rejected at item level (payload is empty)", async () => {
    const { status, data } = await ingest([{}]);
    expect(status).toBe(200);
    expect(data.rejected).toBe(1);
    expect(data.items[0].status).toBe("rejected");
    expect(data.items[0].error.message).toMatch(/empty/i);
  });
});

// ── 2. Valid Baseline ──────────────────────────────────────────────────────

describe("Ingest — Valid Baseline", () => {
  it("2. Single valid customer — all required fields present", async () => {
    const { status, data } = await ingest([MIN_VALID()]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
    expect(data.items[0].status).toBe("accepted");
  });
});

// ── 3-5. primary_id Variants ───────────────────────────────────────────────

describe("Ingest — primary_id Boundary Cases", () => {
  it("3. Missing primary_id — rejected with 'field is required'", async () => {
    const { status, data } = await ingest([{
      api_customer_name_first: "A",
      api_customer_name_last: "B",
      last_name: "C",
    }]);
    expect(status).toBe(200);
    expect(data.rejected).toBe(1);
    expect(data.items[0].error.key).toBe("primary_id");
  });

  it("4a. String primary_id — SILENTLY COERCED to integer and accepted", async () => {
    // BUG-FINDING: '99999999999' string is coerced and accepted without error or warning.
    // The API docs show primary_id as string in examples, so this may be intentional.
    const strId = String(nextId());
    const { status, data } = await ingest([MIN_VALID({ primary_id: strId })]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
    // no error or warning about type coercion
    expect(data.items[0].ignoredFields).toBeNull();
  });

  it("4b. Null primary_id — rejected as required field missing", async () => {
    const { status, data } = await ingest([MIN_VALID({ primary_id: null })]);
    expect(status).toBe(200);
    expect(data.rejected).toBe(1);
    expect(data.items[0].error.key).toBe("primary_id");
  });

  it("4c. Object as primary_id — rejected with 'invalid integer number'", async () => {
    const { status, data } = await ingest([MIN_VALID({ primary_id: { id: 1 } })]);
    expect(status).toBe(200);
    expect(data.rejected).toBe(1);
    expect(data.items[0].error.message).toMatch(/invalid integer/i);
  });

  it("4d. Boolean true as primary_id — SILENTLY COERCED (treated as 1)", async () => {
    // BUG-FINDING: boolean true is accepted as primary_id. No type rejection.
    const { status, data } = await ingest([MIN_VALID({ primary_id: true })]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
  });

  it("4e. Boolean false as primary_id — SILENTLY COERCED (treated as 0)", async () => {
    // BUG-FINDING: boolean false is accepted as primary_id 0.
    const { status, data } = await ingest([MIN_VALID({ primary_id: false })]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
  });

  it("5. Extremely large primary_id (Number.MAX_SAFE_INTEGER + 1) — accepted", async () => {
    // 9007199254740992 — beyond JS safe integer precision, but server accepts it.
    // No overflow/crash. Worth noting if primary_id is stored as int64.
    const { status, data } = await ingest([MIN_VALID({ primary_id: 9007199254740992 })]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
  });

  it("5b. Negative primary_id (-1) — ACCEPTED (no range validation)", async () => {
    // BUG-FINDING: no minimum value check — negative IDs are accepted.
    const { status, data } = await ingest([MIN_VALID({ primary_id: -1 })]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
  });

  it("5c. Zero primary_id — ACCEPTED (no positive-only constraint)", async () => {
    // BUG-FINDING: zero is accepted as a valid primary_id.
    const { status, data } = await ingest([MIN_VALID({ primary_id: 0 })]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
  });
});

// ── 6. Duplicate primary_ids ───────────────────────────────────────────────

describe("Ingest — Duplicate primary_ids in Same Batch", () => {
  it("6. Both records accepted — upsert semantics, no dedup within batch", async () => {
    // BUG-FINDING: duplicate IDs in same batch are both accepted (no within-batch dedup).
    // Last write wins on the DB side, but the API signals 2 accepted with no warning.
    const dupId = nextId();
    const { status, data } = await ingest([
      MIN_VALID({ primary_id: dupId, api_customer_name_first: "First" }),
      MIN_VALID({ primary_id: dupId, api_customer_name_first: "Second" }),
    ]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(2);
    expect(data.rejected).toBe(0);
  });
});

// ── 7. Unknown / Extra Fields ──────────────────────────────────────────────

describe("Ingest — Unknown / Extra Fields", () => {
  it("7. Unknown fields — accepted but listed in ignoredFields", async () => {
    const { status, data } = await ingest([MIN_VALID({ xyz_completely_unknown: "hello", another_mystery: 42 })]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
    // Server reports which fields it ignored
    expect(data.items[0].ignoredFields).toContain("xyz_completely_unknown");
    expect(data.items[0].ignoredFields).toContain("another_mystery");
  });
});

// ── 9. Non-Array Body ──────────────────────────────────────────────────────

describe("Ingest — Non-Array Body", () => {
  it("9a. Plain object — HTTP 400 'root should be array'", async () => {
    const { status, data } = await ingest({ primary_id: nextId() });
    expect(status).toBe(400);
    expect(data.message).toMatch(/array/i);
  });

  it("9b. String body — HTTP 400 'root should be array'", async () => {
    const { status, data } = await ingest('"just a string"');
    expect(status).toBe(400);
  });

  it("9c. Number body — HTTP 400 'root should be array'", async () => {
    const { status, data } = await ingest("12345");
    expect(status).toBe(400);
  });

  it("9d. Null body — HTTP 400", async () => {
    const { status } = await ingest("null");
    expect(status).toBe(400);
  });
});

// ── 10. Malformed / Missing JSON ───────────────────────────────────────────

describe("Ingest — Malformed JSON Body", () => {
  it("10a. Completely malformed JSON — HTTP 400 with parse error message", async () => {
    const { status, data } = await ingest("{not: valid json!!!", "application/json");
    expect(status).toBe(400);
    expect(typeof data.message).toBe("string");
    expect(data.message).toMatch(/malformed json/i);
  });

  it("10b. Truncated JSON — HTTP 400 'incomplete JSON'", async () => {
    const { status, data } = await ingest(
      `[{"primary_id":${nextId()},"first_name":`,
      "application/json"
    );
    expect(status).toBe(400);
    expect(data.message).toMatch(/incomplete/i);
  });

  it("10c. Empty body with JSON content-type — HTTP 400", async () => {
    const res = await fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "",
    });
    expect(res.status).toBe(400);
  });

  it("10d. No Content-Type header — server still processes it", async () => {
    // Without Content-Type, behavior is implementation-defined.
    // The server may accept or reject — 500 would be a bug.
    const res = await fetch(INGEST_URL, {
      method: "POST",
      body: JSON.stringify([MIN_VALID()]),
    });
    expect(res.status).not.toBe(500);
  });
});

// ── 11. Large Batch ────────────────────────────────────────────────────────

describe("Ingest — Large Batch", () => {
  it("11a. 100-item batch — all accepted", async () => {
    const batch = Array.from({ length: 100 }, () => MIN_VALID());
    const { status, data } = await ingest(batch);
    expect(status).toBe(200);
    expect(data.accepted).toBe(100);
    expect(data.rejected).toBe(0);
  });

  it("11b. 1000-item batch — all accepted (no server-side size limit found)", async () => {
    // BUG-FINDING: 1000 items accepted without error — no batch size limit enforced.
    // Could enable DoS via massive batch payloads.
    const batch = Array.from({ length: 1000 }, () => MIN_VALID());
    const { status, data } = await ingest(batch);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1000);
  });
});

// ── 12. Nested / Complex Field Values ─────────────────────────────────────

describe("Ingest — Nested / Complex Field Values", () => {
  it("12a. Nested object as field value — ACCEPTED but field ignored", async () => {
    // BUG-FINDING: nested objects are silently ignored, not rejected.
    // Callers sending { address: { city: "T" } } won't get an error, just data loss.
    const { status, data } = await ingest([MIN_VALID({ address: { city: "Tashkent", zip: "100000" } })]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
    expect(data.items[0].ignoredFields).toContain("address");
  });

  it("12b. Array as field value for a string field — REJECTED ('invalid number')", async () => {
    // Arrays assigned to scalar fields are rejected at item level.
    const { status, data } = await ingest([MIN_VALID({ api_customer_name_first: ["Alice", "Bob"] })]);
    expect(status).toBe(200);
    expect(data.rejected).toBe(1);
    expect(data.items[0].error.message).toMatch(/invalid/i);
  });
});

// ── 13. SQL Injection ──────────────────────────────────────────────────────

describe("Ingest — SQL Injection in Field Values", () => {
  it("13. SQL injection string — accepted without crash (parameterized queries work)", async () => {
    const { status, data } = await ingest([
      MIN_VALID({ api_customer_name_first: "'; DROP TABLE customers; --", last_name: "' OR '1'='1" }),
    ]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
  });
});

// ── 14. Long Field Values ──────────────────────────────────────────────────

describe("Ingest — Long String Field Values", () => {
  it("14. 10,000-char field value — ACCEPTED (no string length cap)", async () => {
    // BUG-FINDING: no length validation. Fields are typed as varchar(50000) internally.
    // 10k chars falls within the DB column size, so no error — but no API-level cap either.
    const { status, data } = await ingest([
      MIN_VALID({ api_customer_name_first: "A".repeat(10_000) }),
    ]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
  });
});

// ── 15. Special Characters / Unicode / Emoji ──────────────────────────────

describe("Ingest — Special Characters / Unicode / Emoji", () => {
  it("15a. Emoji in field values — accepted", async () => {
    const { status, data } = await ingest([
      MIN_VALID({ api_customer_name_first: "Test 🎉🔥💯 Иван محمد" }),
    ]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
  });

  it("15b. Cyrillic / Russian characters — accepted", async () => {
    const { status, data } = await ingest([
      MIN_VALID({ api_customer_name_first: "Иван", api_customer_name_last: "Петров" }),
    ]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
  });

  it("15c. Arabic right-to-left text — accepted", async () => {
    const { status, data } = await ingest([
      MIN_VALID({ api_customer_name_first: "محمد", api_customer_name_last: "علي" }),
    ]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
  });

  it("15d. Null bytes in field value — ACCEPTED (no sanitization)", async () => {
    // BUG-FINDING: null bytes (\\u0000) are accepted without error.
    // This can cause truncation or unexpected behavior in downstream consumers.
    const { status, data } = await ingest([
      MIN_VALID({ api_customer_name_first: "Hello\u0000World\u0001\u001F" }),
    ]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
  });

  it("15e. Newlines and tabs in field value — accepted", async () => {
    const { status, data } = await ingest([
      MIN_VALID({ api_customer_name_first: "Line1\nLine2\tTabbed\r\n" }),
    ]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
  });

  it("15f. Unicode edge cases — BOM, zero-width space, replacement char — accepted", async () => {
    const { status, data } = await ingest([
      MIN_VALID({ api_customer_name_first: "\uFEFFBOM\u200BZeroWidth\uFFFDReplacement" }),
    ]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
  });

  it("15g. Numeric value for a string field — ACCEPTED (coerced to string)", async () => {
    // BUG-FINDING: passing a number for a varchar field is silently coerced.
    const { status, data } = await ingest([
      MIN_VALID({ api_customer_name_first: 12345 }),
    ]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
  });

  it("15h. Empty string for required field — ACCEPTED (null is rejected, '' is not)", async () => {
    // BUG-FINDING: null → rejected as "field is required". Empty string → ACCEPTED.
    // These are inconsistently treated — "" should arguably also fail "required" check.
    const { status, data } = await ingest([
      MIN_VALID({ api_customer_name_first: "" }),
    ]);
    expect(status).toBe(200);
    expect(data.accepted).toBe(1);
  });
});
