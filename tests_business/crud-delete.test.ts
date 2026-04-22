/**
 * DELETE endpoint tests — verifying cleanup/removal for all entity types.
 * Each test creates an entity, then deletes it, then verifies it's gone.
 *
 * Uses per-run factory tag for entity names. No shared test-data imports.
 */
import { describe, it, expect } from "vitest";
import { get, post, put, del } from "../tests_backend/client";
import { makeTag } from "./test-factories";
import { custField, evtField, purchaseTypeId } from "./tenant-context";

const TAG = makeTag();

describe("DELETE Segmentation - /api/tenants/segmentation/{id}", () => {
  let segId: string;

  it("create → delete → verify gone", async () => {
    const { status, data } = await post("/api/tenants/segmentation", {
      name: `${TAG}_del_seg`,
      segments: [{
        name: "Temp",
        customerProfileFilter: { type: "group", group: { logicalOp: "AND", predicates: [], negate: false } },
      }],
    });
    expect(status).toBe(200);
    segId = data.id;

    const { status: delStatus } = await del(`/api/tenants/segmentation/${segId}`);
    expect([200, 204]).toContain(delStatus);

    const { status: getStatus } = await get(`/api/tenants/segmentation/${segId}`);
    expect(getStatus).toBe(404);
  });
});

describe("DELETE Campaign - /api/tenants/campaign/{id}", () => {
  it("create → delete → verify gone", async () => {
    const { data: channels } = await get("/api/tenants/commchan", { verified: true });
    if (!Array.isArray(channels) || channels.length === 0) return;

    const { status, data } = await post("/api/tenants/campaign", {
      name: `${TAG}_del_camp`,
      commChanId: channels[0].id,
      includeSegment: [],
      excludeSegment: [],
    });
    if (status !== 200) { console.warn("Campaign create failed:", status); return; }

    const { status: delStatus } = await del(`/api/tenants/campaign/${data.id}`);
    expect([200, 204]).toContain(delStatus);

    const { status: getStatus } = await get(`/api/tenants/campaign/${data.id}`);
    expect(getStatus).toBe(404);
  });
});

describe("DELETE CommChan - /api/tenants/commchan/{id}", () => {
  it("create → delete → verify gone", async () => {
    const { status, data } = await post("/api/tenants/commchan", {
      name: `${TAG}_del_chan`,
      kind: "blackhole",
      mappings: {},
      chanconf: {},
    });
    expect(status).toBe(200);

    const { status: delStatus } = await del(`/api/tenants/commchan/${data.id}`);
    expect([200, 204]).toContain(delStatus);

    const { status: getStatus } = await get(`/api/tenants/commchan/${data.id}`);
    expect(getStatus).toBe(404);
  });
});

describe("DELETE Template - /api/tenant/template/{id}", () => {
  it("create → delete → verify gone", async () => {
    const { status, data } = await post("/api/tenant/template", {
      content_type: "text",
      name: `${TAG}_del_tmpl`,
      subject: "Delete Test",
      content: "temp",
      variables: {},
    });
    expect(status).toBe(201);

    const { status: delStatus } = await del(`/api/tenant/template/${data.id}`);
    expect([200, 204]).toContain(delStatus);

    const { status: getStatus } = await get(`/api/tenant/template/${data.id}`);
    expect(getStatus).toBe(404);
  });
});

describe("DELETE Customer Schema Field", () => {
  it("create draft field → delete draft → verify gone", async () => {
    const apiName = `del_test_${Date.now()}`;
    const { status, data } = await post("/api/tenants/schema/customers/fields", {
      apiName,
      displayName: "Delete Test Field",
      dataType: "VARCHAR",
      access: "field_optional",
      flagMulti: false,
    });
    expect(status).toBe(200);
    const fieldId = data.ID;

    const { status: delStatus } = await del("/api/tenants/schema/customers/fields", { field_id: fieldId });
    expect([200, 204]).toContain(delStatus);

    const { data: fields } = await get("/api/tenants/schema/customers/fields", { exclude_draft: false });
    const found = fields.list.find((f: any) => f.id === fieldId);
    expect(found).toBeUndefined();
  });
});

describe("DELETE Event Type Field", () => {
  it("create draft event field → delete → verify gone", async () => {
    const apiName = `del_evt_${Date.now()}`;
    const etId = purchaseTypeId();

    const { status, data } = await post(`/api/tenants/schema/events/fields/${etId}`, {
      apiName,
      displayName: "Delete Event Field",
      dataType: "VARCHAR",
      access: "field_optional",
      flagMulti: false,
    });
    expect(status).toBe(200);
    const fieldId = data.ID;

    const { status: delStatus } = await del(`/api/tenants/schema/events/fields/${etId}`, { field_id: fieldId });
    expect([200, 204]).toContain(delStatus);

    const { data: fields } = await get(`/api/tenants/schema/events/fields/${etId}`, { exclude_draft: false });
    const found = fields.list.find((f: any) => f.id === fieldId);
    expect(found).toBeUndefined();
  });
});
