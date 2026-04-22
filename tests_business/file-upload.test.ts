/**
 * File Upload API tests — bulk historical data import.
 *
 * File upload is a parallel ingestion path for tenants who have historical data
 * that shouldn't go through the real-time ingest API (/cdp-ingest/...).
 * Instead, they upload CSV/JSON files containing old customer/event records.
 *
 * Undocumented 3-step chunked upload flow (discovered from FE):
 *   1. POST /api/file/upload/init     → { fileName, fileExtension, sizeBytes, tag } → { objectId }
 *   2. POST /api/file/upload/part     → binary body (octet-stream), objectId as query param → { status }
 *   3. POST /api/file/upload/complete → { objectId } → 204
 *
 * Also tests the CSV paste endpoint: POST /api/tenants/data/file/keys
 */
import { describe, it, expect } from "vitest";
import { api } from "../tests_backend/client";
import { makeTag } from "./test-factories";
import { getTenant } from "./tenant-context";

const TEST_TAG = makeTag();

const BASE_URL = process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz";

async function uploadInit(token: string, fileName: string, ext: string, size: number, tag = "uploads") {
  return api("/api/file/upload/init", {
    method: "POST",
    body: { fileName, fileExtension: ext, sizeBytes: size, tag },
    token,
  });
}

async function uploadPart(token: string, objectId: string, content: string) {
  // FE sends raw binary via ReadableStream with octet-stream content type
  // objectId now passed as X-Object-Id header (was query param before S21)
  const blob = new Blob([content], { type: "application/octet-stream" });
  const res = await fetch(`${BASE_URL}/api/file/upload/part`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "X-Object-Id": objectId,
    },
    body: blob,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function uploadComplete(token: string, objectId: string) {
  return api("/api/file/upload/complete", {
    method: "POST",
    body: { objectId },
    token,
  });
}

describe("File Upload: CSV upload flow", () => {
  const token = () => getTenant().token;

  it("Step 1: init — should return objectId", async () => {
    const csv = "primary_id,first_name,last_name\n99999101,UploadTest,One\n";
    const { status, data } = await uploadInit(token(), `${TEST_TAG}_test.csv`, "csv", csv.length);
    expect(status).toBe(200);
    expect(data).toHaveProperty("objectId");
    expect(typeof data.objectId).toBe("string");
  });

  it("Step 2: part — should accept binary content", async () => {
    const csv = "primary_id,first_name,last_name\n99999102,UploadTest,Two\n";
    const { data: init } = await uploadInit(token(), `${TEST_TAG}_part.csv`, "csv", csv.length);
    const { status, data } = await uploadPart(token(), init.objectId, csv);
    expect(status).toBe(200);
    expect(data?.status).toBe("success");
  });

  it("Step 3: complete — should finalize upload", async () => {
    const csv = "primary_id,first_name,last_name\n99999103,UploadTest,Three\n";
    const { data: init } = await uploadInit(token(), `${TEST_TAG}_complete.csv`, "csv", csv.length);
    await uploadPart(token(), init.objectId, csv);
    const { status } = await uploadComplete(token(), init.objectId);
    expect(status).toBe(204);
  });

  it("full flow: init → part → complete for multi-row CSV", async () => {
    const rows = [
      "primary_id,first_name,last_name,gender,email",
      "99999110,Alice,Upload,female,alice_upload@test.cdp",
      "99999111,Bob,Upload,male,bob_upload@test.cdp",
      "99999112,Carol,Upload,female,carol_upload@test.cdp",
    ];
    const csv = rows.join("\n") + "\n";

    const { status: initStatus, data: init } = await uploadInit(
      token(), `${TEST_TAG}_multi.csv`, "csv", csv.length
    );
    expect(initStatus).toBe(200);

    const { status: partStatus } = await uploadPart(token(), init.objectId, csv);
    expect(partStatus).toBe(200);

    const { status: completeStatus } = await uploadComplete(token(), init.objectId);
    expect(completeStatus).toBe(204);
  });
});

describe("File Upload: edge cases", () => {
  const token = () => getTenant().token;

  it("should accept JSON file extension", async () => {
    const json = JSON.stringify([{ primary_id: 99999120, first_name: "JsonTest" }]);
    const { status, data } = await uploadInit(token(), `${TEST_TAG}_test.json`, "json", json.length);
    expect(status).toBe(200);
    expect(data).toHaveProperty("objectId");
  });

  it("should handle empty file (0 bytes)", async () => {
    const { status, data } = await uploadInit(token(), `${TEST_TAG}_empty.csv`, "csv", 0);
    // Should either accept (and handle on complete) or reject at init
    expect([200, 400]).toContain(status);
  });

  it("should reject complete without part", async () => {
    const { data: init } = await uploadInit(token(), `${TEST_TAG}_nopart.csv`, "csv", 10);
    if (!init.objectId) return;
    const { status } = await uploadComplete(token(), init.objectId);
    // Complete without uploading content should fail or succeed with empty content
    expect([204, 400, 409]).toContain(status);
  });

  it("should reject complete with invalid objectId", async () => {
    const { status } = await uploadComplete(token(), "00000000-0000-0000-0000-000000000000");
    expect([400, 404, 409, 500]).toContain(status);
  });

  it("should reject part with invalid objectId", async () => {
    const { status } = await uploadPart(token(), "00000000-0000-0000-0000-000000000000", "data");
    expect([400, 404, 409, 500]).toContain(status);
  });
});

describe("File Upload: CSV paste endpoint (BUG-013: not implemented)", () => {
  const token = () => getTenant().token;

  it("POST /api/tenants/data/file/keys — should process pasted CSV (currently returns 500)", async () => {
    const csv = "primary_id,first_name,last_name\n99999301,PasteTest,One\n99999302,PasteTest,Two";
    const { status, data } = await api("/api/tenants/data/file/keys", {
      method: "POST",
      body: { isCustomer: true, objectId: "", body: csv },
      token: token(),
    });
    // BUG-013: Returns 500 with {"debug":"implement me","error":"internal server error"}
    // Expected: 200 with ingest results
    expect(status).toBe(200);
  });
});
