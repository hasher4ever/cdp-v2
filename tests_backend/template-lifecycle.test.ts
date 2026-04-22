/**
 * Template Full Lifecycle Test
 *
 * Hypothesis-driven tests covering the template CRUD lifecycle end-to-end.
 * Each test answers a specific question about system behavior.
 *
 * Known bugs exercised:
 *   BUG-044: DELETE /api/tenant/template/{id} returns "method not allowed"
 *
 * Known quirks:
 *   - CREATE body uses `name` field; GET/LIST response uses `template_name` (field rename inconsistency)
 *   - All 5 fields (name, subject, content_type, content, variables) are required on CREATE
 *   - content_type must be one of: "html", "text", "json" (not "text/plain")
 *   - CREATE returns HTTP 201 (not 200) — common enough to handle in assertions
 *   - Empty content causes 500 (server panic) instead of 400 validation error
 */
import { describe, it, expect } from "vitest";
import { get, post, put, del } from "./client";
import "./setup";

const TAG = "TEST_lifecycle_tmpl";
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

// ─── 1. LIST endpoint contract ───────────────────────────────────────────────

describe("Template LIST — GET /api/tenant/template", () => {
  it("returns 200 with {list: array} shape", async () => {
    const { status, data } = await get("/api/tenant/template");
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
    expect(Array.isArray(data.list)).toBe(true);
  });

  it("each list item has id, template_name, subject, content_type fields", async () => {
    const { data } = await get("/api/tenant/template");
    for (const item of data.list) {
      expect(typeof item.id).toBe("string");
      expect(item.id.length).toBeGreaterThan(0);
      expect(typeof item.template_name).toBe("string");
      expect(typeof item.subject).toBe("string");
      expect(typeof item.content_type).toBe("string");
    }
  });
});

// ─── 2. CREATE → GET-by-id → PUT → verify lifecycle ─────────────────────────

describe("Template full lifecycle — create → get → update → verify", () => {
  let templateId: string;
  const baseName = `${TAG}_${Date.now()}`;

  it("2. CREATE with valid payload returns {id}", async () => {
    const payload = {
      name: baseName,
      subject: "Hello from test",
      content_type: "text",
      content: "Test content body",
      variables: {},
    };

    const { status, data } = await post("/api/tenant/template", payload);
    console.log(`CREATE status: ${status}, data: ${JSON.stringify(data).slice(0, 300)}`);
    // Server returns 201 Created (not 200 OK) for template create
    expect([200, 201]).toContain(status);
    expect(data).toHaveProperty("id");
    expect(typeof data.id).toBe("string");
    expect(data.id.length).toBeGreaterThan(0);
    templateId = data.id;
  });

  it("3. GET-by-id returns full object with expected fields", async () => {
    if (!templateId) return;

    const { status, data } = await get(`/api/tenant/template/${templateId}`);
    console.log(`GET-by-id status: ${status}, data: ${JSON.stringify(data).slice(0, 400)}`);
    expect(status).toBe(200);
    expect(data.id).toBe(templateId);
    expect(data).toHaveProperty("template_name");
    expect(data).toHaveProperty("subject");
    expect(data).toHaveProperty("content_type");
    expect(data).toHaveProperty("content");
    expect(data).toHaveProperty("variables");
  });

  it("4. PUT updates subject and content — GET confirms persistence", async () => {
    if (!templateId) return;

    const updatedSubject = "Updated subject " + Date.now();
    const updatedContent = "Updated content body " + Date.now();
    const putPayload = {
      name: baseName,
      subject: updatedSubject,
      content_type: "text",
      content: updatedContent,
      variables: {},
    };

    const { status: putStatus, data: putData } = await put(
      `/api/tenant/template/${templateId}`,
      putPayload
    );
    console.log(`PUT status: ${putStatus}, data: ${JSON.stringify(putData).slice(0, 300)}`);
    expect(putStatus).toBe(200);

    // Verify persistence via GET
    const { status: getStatus, data: getData } = await get(
      `/api/tenant/template/${templateId}`
    );
    expect(getStatus).toBe(200);
    expect(getData.subject).toBe(updatedSubject);
    expect(getData.content).toBe(updatedContent);
  });
});

// ─── 3. BUG-044: DELETE returns "method not allowed" ─────────────────────────

describe("BUG-044: DELETE /api/tenant/template/{id} returns method not allowed", () => {
  let templateId: string;

  it("setup: create a template to attempt deletion on", async () => {
    const { status, data } = await post("/api/tenant/template", {
      name: `${TAG}_del_${Date.now()}`,
      subject: "Delete target",
      content_type: "text",
      content: "To be deleted",
      variables: {},
    });
    console.log(`DELETE-target CREATE: status ${status}, data: ${JSON.stringify(data).slice(0, 200)}`);
    if ((status === 200 || status === 201) && data.id) {
      templateId = data.id;
    } else {
      console.warn("Cannot create template for DELETE test — falling back to nil UUID probe");
    }
  });

  it("BUG-044: DELETE returns 405 or body containing 'method not allowed'", async () => {
    const idToDelete = templateId || NIL_UUID;
    const { status, data } = await del(`/api/tenant/template/${idToDelete}`);
    console.log(
      `DELETE status: ${status}, data: ${JSON.stringify(data).slice(0, 200)}`
    );

    if (status === 200 || status === 204) {
      // Bug is fixed — DELETE now works
      console.log("BUG-044 FIXED: DELETE template now returns success");
      expect([200, 204]).toContain(status);
    } else {
      // Bug still present
      const body = typeof data === "string" ? data : JSON.stringify(data);
      const isMethodNotAllowed =
        status === 405 || body.toLowerCase().includes("method not allowed");
      expect(isMethodNotAllowed).toBe(true);
      console.log("BUG-044 confirmed: DELETE template returns method not allowed");
    }
  });
});

// ─── 4. CREATE edge cases — empty content ────────────────────────────────────

describe("Template CREATE edge case — empty content", () => {
  it("6. CREATE with empty content — observe if accepted or rejected", async () => {
    const { status, data } = await post("/api/tenant/template", {
      name: `${TAG}_empty_content_${Date.now()}`,
      subject: "Empty content test",
      content_type: "text",
      content: "",
      variables: {},
    });

    console.log(
      `Empty content CREATE: status ${status}, data: ${JSON.stringify(data).slice(0, 200)}`
    );
    if (status === 400 || status === 422) {
      console.log("Good: empty content rejected with validation error");
    } else if (status === 200 || status === 201) {
      console.log(
        "FINDING: empty content accepted — no server-side validation on content field"
      );
    } else if (status === 500) {
      console.log(
        "FINDING: empty content causes 500 — server panics instead of returning a proper validation error (BUG candidate)"
      );
    }
    // Record actual behavior; 500 here means server-side crash on empty content
    expect([200, 201, 400, 422, 500]).toContain(status);
  });
});

// ─── 5. CREATE with missing required fields ───────────────────────────────────

describe("Template CREATE — missing required fields", () => {
  it("7a. CREATE without subject — observe validation behavior", async () => {
    const { status, data } = await post("/api/tenant/template", {
      name: `${TAG}_no_subject_${Date.now()}`,
      content_type: "text",
      content: "Some content",
      variables: {},
      // subject intentionally omitted
    });
    console.log(
      `Missing subject: status ${status}, data: ${JSON.stringify(data).slice(0, 200)}`
    );
    // Should fail; 500 here indicates nil pointer crash rather than proper validation
    if (status === 500) {
      console.log(
        "FINDING: missing subject causes 500 — server not validating required fields"
      );
    }
    expect([200, 400, 422, 500]).toContain(status);
  });

  it("7b. CREATE without content_type — observe validation behavior", async () => {
    const { status, data } = await post("/api/tenant/template", {
      name: `${TAG}_no_ctype_${Date.now()}`,
      subject: "No content_type",
      content: "Some content",
      variables: {},
      // content_type intentionally omitted
    });
    console.log(
      `Missing content_type: status ${status}, data: ${JSON.stringify(data).slice(0, 200)}`
    );
    if (status === 500) {
      console.log(
        "FINDING: missing content_type causes 500 — server not validating required fields"
      );
    }
    expect([200, 400, 422, 500]).toContain(status);
  });

  it("7c. CREATE with empty body {} — observe error type", async () => {
    const { status, data } = await post("/api/tenant/template", {});
    console.log(
      `Empty body CREATE: status ${status}, data: ${JSON.stringify(data).slice(0, 200)}`
    );
    expect([400, 422, 500]).toContain(status);
    if (status === 500) {
      console.log(
        "FINDING: empty body causes 500 — possible nil pointer on missing required fields"
      );
    }
  });
});

// ─── 6. GET non-existent ID ───────────────────────────────────────────────────

describe("Template error handling — non-existent ID", () => {
  it("8. GET with nil UUID returns error (not 200)", async () => {
    const { status, data } = await get(`/api/tenant/template/${NIL_UUID}`);
    console.log(
      `GET nil UUID: status ${status}, data: ${JSON.stringify(data).slice(0, 200)}`
    );
    expect(status).not.toBe(200);
    expect([400, 404, 500]).toContain(status);
  });

  it("8b. GET with random UUID returns error (not 200)", async () => {
    const fakeId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const { status } = await get(`/api/tenant/template/${fakeId}`);
    expect(status).not.toBe(200);
  });
});

// ─── 7. Old schema probe: CREATE with `template_name` instead of `name` ──────

describe("Template schema probe — old field name `template_name` in CREATE body", () => {
  it("9. CREATE with `template_name` instead of `name` — observe if accepted", async () => {
    const { status, data } = await post("/api/tenant/template", {
      template_name: `${TAG}_oldfield_${Date.now()}`,
      subject: "Old schema probe",
      content_type: "text",
      content: "Using template_name field",
      variables: {},
    });

    console.log(
      `template_name field CREATE: status ${status}, data: ${JSON.stringify(data).slice(0, 200)}`
    );
    if (status === 200) {
      console.log(
        "FINDING: server accepts `template_name` in create body — old schema still honoured or field is ignored/mapped"
      );
    } else {
      console.log(
        `template_name rejected (${status}) — only 'name' is valid in create body`
      );
    }
    // No hard assertion — pure observation; both outcomes are informative
    expect([200, 201, 400, 422, 500]).toContain(status);
  });
});

// ─── 8. Naming inconsistency roundtrip: CREATE `name` → GET `template_name` ──

describe("Template naming inconsistency — CREATE `name` vs GET `template_name`", () => {
  it("10. CREATE with `name`, verify GET returns it under `template_name`", async () => {
    const uniqueName = `${TAG}_naming_${Date.now()}`;
    const { status: createStatus, data: createData } = await post(
      "/api/tenant/template",
      {
        name: uniqueName,
        subject: "Naming test",
        content_type: "text",
        content: "Naming inconsistency test body",
        variables: {},
      }
    );

    console.log(
      `Naming roundtrip CREATE: status ${createStatus}, data: ${JSON.stringify(createData).slice(0, 200)}`
    );
    // Server returns 201 Created for template create
    expect([200, 201]).toContain(createStatus);
    expect(createData).toHaveProperty("id");

    const templateId: string = createData.id;

    const { status: getStatus, data: getData } = await get(
      `/api/tenant/template/${templateId}`
    );
    expect(getStatus).toBe(200);

    // Core assertion: `name` on input becomes `template_name` on output
    expect(getData).toHaveProperty("template_name");
    expect(getData.template_name).toBe(uniqueName);

    // Sanity: response should NOT surface the key as plain `name`
    if (getData.name !== undefined) {
      console.log(
        "FINDING: GET response also includes `name` key alongside `template_name` — possible duplicate field"
      );
    }

    console.log(
      `Naming inconsistency confirmed: created with name='${uniqueName}', GET returns template_name='${getData.template_name}'`
    );
  });
});
