import { describe, it, expect } from "vitest";
import { api, get, post } from "./client";

describe("Signup - /public/api/signup", () => {
  const ts = Date.now();
  const tenantName = `test_signup_${ts}`;
  const domain = `${tenantName}.cdp.com`;
  const email = `shop_${ts}@cdp.test`;
  const password = "qwerty123";
  let tenantId: number;
  let jwtToken: string;

  it("should create a new tenant with valid payload", async () => {
    const { status, data } = await api("/public/api/signup", {
      method: "POST",
      body: {
        name: tenantName,
        domainName: domain,
        user: { email, password, firstName: "Test", lastName: "Signup" },
      },
      token: "",
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("tenant");
    expect(data).toHaveProperty("customerFields");
    expect(data).toHaveProperty("eventFields");
    expect(data.tenant).toHaveProperty("tenantId");
    expect(data.tenant).toHaveProperty("isReady");
    expect(data.tenant).toHaveProperty("database");
    expect(data.tenant).toHaveProperty("tableCustomer");
    expect(data.tenant).toHaveProperty("tableEvents");
    expect(data.tenant).toHaveProperty("topicCustomer");
    expect(data.tenant).toHaveProperty("topicEvents");
    tenantId = data.tenant.tenantId;
  });

  it("should be able to sign in to the new tenant", async () => {
    if (!tenantId) return;
    const { status, data } = await api("/public/api/signin", {
      method: "POST",
      body: { username: email, password, domainName: domain },
      token: "",
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("jwtToken");
    jwtToken = data.jwtToken;
  });

  it("should get tenant info with the new token", async () => {
    if (!jwtToken) return;
    const { status, data } = await api("/api/tenants/info", { token: jwtToken });
    expect(status).toBe(200);
    expect(data).toHaveProperty("customerFields");
    expect(data).toHaveProperty("eventFields");
  });

  it("should reject signup with duplicate domain", async () => {
    const { status } = await api("/public/api/signup", {
      method: "POST",
      body: {
        name: "duplicate",
        domainName: domain,
        user: { email: `dup_${ts}@cdp.test`, password, firstName: "Dup", lastName: "Test" },
      },
      token: "",
    });
    expect(status).toBe(409);
  });

  it("should reject signup with short domain", async () => {
    const { status } = await api("/public/api/signup", {
      method: "POST",
      body: {
        name: "x",
        domainName: "ab",
        user: { email: `short_${ts}@cdp.test`, password, firstName: "A", lastName: "B" },
      },
      token: "",
    });
    // domainName minLength=3, name minLength=1
    expect([400, 409]).toContain(status);
  });
});

describe("Employee - /api/tenant/employee", () => {
  it("should create an employee for the tenant (BUG-012: returns 500)", async () => {
    const ts = Date.now();
    const { status, data } = await post("/api/tenant/employee", {
      username: `employee_${ts}@cdp.test`,
      password: "employee123",
      firstName: "Employee",
      lastName: "Test",
    });
    // BUG-012: Currently returns 500, expected 200
    expect(status).toBe(200);
    expect(data).toHaveProperty("userID");
    expect(typeof data.userID).toBe("string");
  });

  it("should reject employee with missing required fields", async () => {
    const { status } = await post("/api/tenant/employee", {
      username: `incomplete_${Date.now()}@cdp.test`,
      // missing password, firstName, lastName
    });
    expect([400, 409]).toContain(status);
  });
});
