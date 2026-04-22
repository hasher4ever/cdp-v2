import { describe, it, expect } from "vitest";
import { api, getAuthToken } from "./client";

const BASE = globalThis.__cdp_base_url;
const DOMAIN = process.env.CDP_DOMAIN!;
const EMAIL = process.env.CDP_EMAIL!;
const PASSWORD = process.env.CDP_PASSWORD!;

describe("Auth - /public/api/signin", () => {
  it("should sign in with valid credentials and return JWT", async () => {
    const token = await getAuthToken(BASE, DOMAIN, EMAIL, PASSWORD);
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
    // JWT has 3 parts
    expect(token.split(".")).toHaveLength(3);
  });

  it("should return 401 for wrong password", async () => {
    const res = await api("/public/api/signin", {
      method: "POST",
      body: { username: EMAIL, password: "wrongpassword", domainName: DOMAIN },
      token: "",
    });
    expect(res.status).toBe(401);
  });

  it("should return 401 for wrong email", async () => {
    const res = await api("/public/api/signin", {
      method: "POST",
      body: { username: "nonexistent@cdp.ru", password: PASSWORD, domainName: DOMAIN },
      token: "",
    });
    expect(res.status).toBe(401);
  });

  it("should return 401 for wrong domain", async () => {
    const res = await api("/public/api/signin", {
      method: "POST",
      body: { username: EMAIL, password: PASSWORD, domainName: "wrong.domain.com" },
      token: "",
    });
    expect(res.status).toBe(401);
  });

  it("should reject requests without token on protected endpoints", async () => {
    const res = await api("/api/tenants/info", { token: "" });
    expect([401, 403]).toContain(res.status);
  });

  it("should reject requests with invalid token", async () => {
    const res = await api("/api/tenants/info", { token: "invalid.jwt.token" });
    expect([401, 403]).toContain(res.status);
  });
});
