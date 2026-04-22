import { describe, it, expect } from "vitest";
import { get, post, put } from "./client";

describe("Templates - /api/tenant/template", () => {
  let createdTemplateId: string;

  it("should list templates with pagination", async () => {
    const { status, data } = await get("/api/tenant/template", { page: 0, size: 10 });
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
    expect(data).toHaveProperty("totalCount");
    expect(typeof data.totalCount).toBe("number");
  });

  it("should have valid template list items", async () => {
    const { data } = await get("/api/tenant/template", { page: 0, size: 10 });
    for (const item of data.list) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("template_name");
      expect(item).toHaveProperty("content_type");
      expect(item).toHaveProperty("subject");
    }
  });

  it("should create a text template", async () => {
    const payload = {
      content_type: "text",
      name: `test_template_${Date.now()}`,
      subject: "Test Subject",
      content: "Hello {{name}}, this is a test.",
      variables: { name: "col__varchar_s50000__4" },
    };

    const { status, data } = await post("/api/tenant/template", payload);
    expect(status).toBe(201);
    expect(data).toHaveProperty("id");
    createdTemplateId = data.id;
  });

  it("should create an HTML template", async () => {
    const payload = {
      content_type: "html",
      name: `test_html_template_${Date.now()}`,
      subject: "HTML Test",
      content: "<h1>Hello {{name}}</h1>",
      variables: { name: "col__varchar_s50000__4" },
    };

    const { status, data } = await post("/api/tenant/template", payload);
    expect(status).toBe(201);
    expect(data).toHaveProperty("id");
  });

  it("should get template details by ID", async () => {
    if (!createdTemplateId) return;

    const { status, data } = await get(`/api/tenant/template/${createdTemplateId}`);
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("template_name");
    expect(data).toHaveProperty("content_type");
    expect(data).toHaveProperty("subject");
    expect(data).toHaveProperty("content");
    expect(data).toHaveProperty("variables");
    expect(data.content_type).toBe("text");
  });

  it("should update a template", async () => {
    if (!createdTemplateId) return;

    const payload = {
      content_type: "text",
      name: `test_template_updated_${Date.now()}`,
      subject: "Updated Subject",
      content: "Updated content: {{name}}",
      variables: { name: "col__varchar_s50000__4" },
    };

    const { status, data } = await put(`/api/tenant/template/${createdTemplateId}`, payload);
    expect(status).toBe(200);
    expect(data.subject).toBe("Updated Subject");
  });

  it("should return 404 for non-existent template", async () => {
    const { status } = await get("/api/tenant/template/00000000-0000-0000-0000-000000000000");
    expect(status).toBe(404);
  });
});
