/**
 * Employee CRUD lifecycle tests.
 *
 * Known bugs:
 *   BUG-012: POST /api/tenant/employee returns 500 with
 *     "GetTenantEmployeeByTenant requies ctx tenantId"
 *
 * Discovery notes (from API probing):
 *   - Only POST /api/tenant/employee is defined in the OpenAPI spec
 *   - GET /api/tenant/employee returns 400 "method not allowed"
 *   - GET/PUT/DELETE /api/tenant/employee/{id} returns 404 "no matching operation"
 *   - No list-employees endpoint exists (GET /api/tenants/employees → 404)
 *
 * These tests document the expected CRUD lifecycle even though most operations
 * are currently blocked by BUG-012 (can't create) or missing routes.
 */
import { describe, it, expect } from "vitest";
import { get, post, put, del } from "./client";

const TEST_TAG = "test_emp";

// ─── Employee Creation (BUG-012) ────────────────────────────────────────────

describe("Employee Create - POST /api/tenant/employee", () => {
  it("should create an employee with valid payload (BUG-012: returns 500)", async () => {
    const ts = Date.now();
    const { status, data } = await post("/api/tenant/employee", {
      username: `${TEST_TAG}_${ts}@cdp.test`,
      password: "employee123",
      firstName: "Test",
      lastName: "Employee",
    });
    // BUG-012: Currently returns 500 with:
    //   {"debug":"GetTenantEmployeeByTenant requies ctx tenantId","error":"internal server error"}
    // Expected: 200 with { userID: "<uuid>" }
    expect(status).toBe(200);
    expect(data).toHaveProperty("userID");
    expect(typeof data.userID).toBe("string");
  });

  it("should reject employee creation with missing password", async () => {
    const ts = Date.now();
    const { status } = await post("/api/tenant/employee", {
      username: `${TEST_TAG}_nopwd_${ts}@cdp.test`,
      firstName: "No",
      lastName: "Password",
    });
    // Missing required field "password" per EmployeeCreateReq schema
    // BUG-012 may cause 500 instead of proper 400 validation
    expect([400, 422]).toContain(status);
  });

  it("should reject employee creation with missing username", async () => {
    const { status } = await post("/api/tenant/employee", {
      password: "employee123",
      firstName: "No",
      lastName: "Username",
    });
    expect([400, 422]).toContain(status);
  });

  it("should reject employee creation with missing firstName", async () => {
    const ts = Date.now();
    const { status } = await post("/api/tenant/employee", {
      username: `${TEST_TAG}_nofn_${ts}@cdp.test`,
      password: "employee123",
      lastName: "NoFirst",
    });
    expect([400, 422]).toContain(status);
  });

  it("should reject employee creation with missing lastName", async () => {
    const ts = Date.now();
    const { status } = await post("/api/tenant/employee", {
      username: `${TEST_TAG}_noln_${ts}@cdp.test`,
      password: "employee123",
      firstName: "NoLast",
    });
    expect([400, 422]).toContain(status);
  });

  it("should reject employee creation with empty body", async () => {
    const { status } = await post("/api/tenant/employee", {});
    expect([400, 422]).toContain(status);
  });
});

// ─── Employee List (undiscovered endpoint) ──────────────────────────────────

describe("Employee List - GET /api/tenant/employee", () => {
  it("should list employees for the tenant (currently returns 400 method not allowed)", async () => {
    const { status, data } = await get("/api/tenant/employee");
    // API returns 400 "method not allowed" — GET is not routed on this endpoint.
    // Expected: 200 with an array of employee objects.
    // This documents the missing GET route.
    expect(status).toBe(200);
    expect(Array.isArray(data) || (data && Array.isArray(data.items))).toBe(true);
  });
});

// ─── Employee by ID ─────────────────────────────────────────────────────────

describe("Employee by ID - GET /api/tenant/employee/{id}", () => {
  it("should return 404 for non-existent employee ID", async () => {
    const { status } = await get("/api/tenant/employee/00000000-0000-0000-0000-000000000000");
    // Route doesn't exist — returns 404 "no matching operation was found"
    // Expected: 404 (correct for non-existent ID, but the route itself is missing)
    expect(status).toBe(404);
  });

  it("should retrieve a created employee by ID (blocked by BUG-012)", async () => {
    // Step 1: Try to create an employee
    const ts = Date.now();
    const createRes = await post("/api/tenant/employee", {
      username: `${TEST_TAG}_getbyid_${ts}@cdp.test`,
      password: "employee123",
      firstName: "GetById",
      lastName: "Test",
    });

    // BUG-012 blocks creation — skip retrieval if create failed
    if (createRes.status !== 200 || !createRes.data?.userID) {
      // Document: Cannot test GET-by-ID because BUG-012 prevents employee creation
      expect(createRes.status).toBe(200); // Will fail — documents the dependency on BUG-012
      return;
    }

    const userId = createRes.data.userID;
    const { status, data } = await get(`/api/tenant/employee/${userId}`);
    expect(status).toBe(200);
    expect(data).toHaveProperty("userID", userId);
    expect(data).toHaveProperty("firstName", "GetById");
    expect(data).toHaveProperty("lastName", "Test");
  });
});

// ─── Employee Update ────────────────────────────────────────────────────────

describe("Employee Update - PUT /api/tenant/employee/{id}", () => {
  it("should return 404 for PUT on non-existent employee", async () => {
    const { status } = await put(
      "/api/tenant/employee/00000000-0000-0000-0000-000000000000",
      { firstName: "Updated", lastName: "Name" },
    );
    // Route doesn't exist — returns 404 "no matching operation was found"
    expect(status).toBe(404);
  });

  it("should update an existing employee (blocked by BUG-012)", async () => {
    // Step 1: Try to create an employee
    const ts = Date.now();
    const createRes = await post("/api/tenant/employee", {
      username: `${TEST_TAG}_update_${ts}@cdp.test`,
      password: "employee123",
      firstName: "Before",
      lastName: "Update",
    });

    // BUG-012 blocks creation
    if (createRes.status !== 200 || !createRes.data?.userID) {
      expect(createRes.status).toBe(200); // Will fail — documents BUG-012 dependency
      return;
    }

    const userId = createRes.data.userID;
    const { status, data } = await put(`/api/tenant/employee/${userId}`, {
      firstName: "After",
      lastName: "Update",
    });
    expect([200, 204]).toContain(status);
  });
});

// ─── Employee Delete ────────────────────────────────────────────────────────

describe("Employee Delete - DELETE /api/tenant/employee/{id}", () => {
  it("should return 404 for DELETE on non-existent employee", async () => {
    const { status } = await del("/api/tenant/employee/00000000-0000-0000-0000-000000000000");
    // Route doesn't exist — returns 404 "no matching operation was found"
    expect(status).toBe(404);
  });

  it("should delete an existing employee (blocked by BUG-012)", async () => {
    // Step 1: Try to create an employee
    const ts = Date.now();
    const createRes = await post("/api/tenant/employee", {
      username: `${TEST_TAG}_delete_${ts}@cdp.test`,
      password: "employee123",
      firstName: "ToDelete",
      lastName: "Test",
    });

    // BUG-012 blocks creation
    if (createRes.status !== 200 || !createRes.data?.userID) {
      expect(createRes.status).toBe(200); // Will fail — documents BUG-012 dependency
      return;
    }

    const userId = createRes.data.userID;
    const { status } = await del(`/api/tenant/employee/${userId}`);
    expect([200, 204]).toContain(status);

    // Verify deletion
    const getRes = await get(`/api/tenant/employee/${userId}`);
    expect(getRes.status).toBe(404);
  });

  it("should reject DELETE without an ID (method not allowed on base path)", async () => {
    const { status } = await del("/api/tenant/employee");
    // Base path only supports POST — DELETE returns 400 "method not allowed"
    expect(status).toBe(400);
  });
});

// ─── Employee Duplicate Prevention ──────────────────────────────────────────

describe("Employee Duplicate - POST /api/tenant/employee", () => {
  it("should reject duplicate employee username (blocked by BUG-012)", async () => {
    const ts = Date.now();
    const username = `${TEST_TAG}_dup_${ts}@cdp.test`;
    const payload = {
      username,
      password: "employee123",
      firstName: "Dup",
      lastName: "Test",
    };

    // First create
    const first = await post("/api/tenant/employee", payload);
    // BUG-012 blocks creation
    if (first.status !== 200) {
      expect(first.status).toBe(200); // Will fail — documents BUG-012
      return;
    }

    // Second create with same username
    const second = await post("/api/tenant/employee", payload);
    expect(second.status).toBe(409); // Conflict — duplicate username
  });
});
