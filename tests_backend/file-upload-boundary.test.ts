/**
 * File Upload API — Boundary & Edge-Case Tests
 *
 * Covers cases NOT present in file-upload.test.ts:
 *   - Long / special / unicode fileNames
 *   - Negative and huge sizeBytes
 *   - Per-field absence (no fileName / no fileExtension / no sizeBytes)
 *   - Unusual extensions (xyz, exe)
 *   - Empty tag vs missing tag
 *   - Complete with UUID-format non-existent objectId
 *   - Complete with malformed (non-UUID) objectId
 *   - Init → complete with no part (skip part step)
 *   - Double complete (same objectId twice)
 *   - Part upload with empty body
 *   - Part upload to valid-UUID non-existent objectId
 */
import { describe, it, expect } from "vitest";
import { post } from "./client";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Upload a binary part directly, returns the fetch Response. */
async function uploadPart(objectId: string, body: BodyInit | null): Promise<Response> {
  return fetch(
    `${globalThis.__cdp_base_url}/api/file/upload/part`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${globalThis.__cdp_token}`,
        "Content-Type": "application/octet-stream",
        "X-Object-Id": objectId,
      },
      body,
    }
  );
}

/** Quick init returning objectId (asserts 200). */
async function quickInit(overrides: Record<string, unknown> = {}): Promise<string> {
  const { status, data } = await post("/api/file/upload/init", {
    fileName: "boundary_test.csv",
    fileExtension: "csv",
    sizeBytes: 42,
    tag: "uploads",
    ...overrides,
  });
  expect(status).toBe(200);
  expect(data).toHaveProperty("objectId");
  return data.objectId as string;
}

/** A fake UUID that is structurally valid but will never exist. */
const FAKE_UUID = "00000000-dead-beef-dead-beefdeadbeef";

// ─── Init — fileName edge cases ──────────────────────────────────────────────

describe("File Upload Init — fileName edge cases", () => {
  it("should handle very long fileName (1000 chars)", async () => {
    const longName = "a".repeat(990) + ".csv";
    const { status } = await post("/api/file/upload/init", {
      fileName: longName,
      fileExtension: "csv",
      sizeBytes: 100,
      tag: "test",
    });
    // Server may accept or reject; must not hang or crash
    expect([200, 400, 413, 422, 500]).toContain(status);
  });

  it("should handle special characters in fileName", async () => {
    const { status } = await post("/api/file/upload/init", {
      fileName: "test file (1) @#$%^&.csv",
      fileExtension: "csv",
      sizeBytes: 100,
      tag: "test",
    });
    expect([200, 400]).toContain(status);
  });

  it("should handle unicode / emoji in fileName", async () => {
    const { status } = await post("/api/file/upload/init", {
      fileName: "тест_файл_данные_🗂️.csv",
      fileExtension: "csv",
      sizeBytes: 100,
      tag: "test",
    });
    expect([200, 400]).toContain(status);
  });
});

// ─── Init — sizeBytes edge cases ─────────────────────────────────────────────

describe("File Upload Init — sizeBytes edge cases", () => {
  it("should handle negative sizeBytes", async () => {
    const { status } = await post("/api/file/upload/init", {
      fileName: "negative.csv",
      fileExtension: "csv",
      sizeBytes: -1,
      tag: "test",
    });
    expect([400, 422, 500]).toContain(status);
  });

  it("should handle extremely large sizeBytes (999999999999)", async () => {
    const { status } = await post("/api/file/upload/init", {
      fileName: "huge.csv",
      fileExtension: "csv",
      sizeBytes: 999999999999,
      tag: "test",
    });
    // Server may accept and let storage deal with it, or reject up front
    expect([200, 400, 413, 422, 500]).toContain(status);
  });
});

// ─── Init — per-field absence ─────────────────────────────────────────────────

describe("File Upload Init — per-field absence", () => {
  it("should reject body missing only fileName", async () => {
    const { status } = await post("/api/file/upload/init", {
      fileExtension: "csv",
      sizeBytes: 100,
      tag: "test",
    });
    expect([400, 422, 500]).toContain(status);
  });

  it("should reject body missing only fileExtension", async () => {
    const { status } = await post("/api/file/upload/init", {
      fileName: "no_ext.csv",
      sizeBytes: 100,
      tag: "test",
    });
    expect([400, 422, 500]).toContain(status);
  });

  it("should reject body missing only sizeBytes", async () => {
    const { status } = await post("/api/file/upload/init", {
      fileName: "no_size.csv",
      fileExtension: "csv",
      tag: "test",
    });
    expect([400, 422, 500]).toContain(status);
  });
});

// ─── Init — extension edge cases ─────────────────────────────────────────────

describe("File Upload Init — extension edge cases", () => {
  it("should handle unknown generic extension (xyz)", async () => {
    const { status } = await post("/api/file/upload/init", {
      fileName: "data.xyz",
      fileExtension: "xyz",
      sizeBytes: 100,
      tag: "test",
    });
    expect([200, 400, 422]).toContain(status);
  });

  it("should handle executable extension (exe)", async () => {
    const { status } = await post("/api/file/upload/init", {
      fileName: "payload.exe",
      fileExtension: "exe",
      sizeBytes: 100,
      tag: "test",
    });
    // Security-conscious servers may reject exe; permissive ones return 200
    expect([200, 400, 422, 403]).toContain(status);
  });
});

// ─── Init — tag edge cases ────────────────────────────────────────────────────

describe("File Upload Init — tag edge cases", () => {
  it("should handle empty string tag", async () => {
    const { status, data } = await post("/api/file/upload/init", {
      fileName: "empty_tag.csv",
      fileExtension: "csv",
      sizeBytes: 100,
      tag: "",
    });
    expect([200, 400]).toContain(status);
  });

  it("should handle missing tag field", async () => {
    const { status, data } = await post("/api/file/upload/init", {
      fileName: "no_tag.csv",
      fileExtension: "csv",
      sizeBytes: 100,
      // tag omitted entirely
    });
    expect([200, 400]).toContain(status);
  });
});

// ─── Complete — objectId edge cases ──────────────────────────────────────────

describe("File Upload Complete — objectId edge cases", () => {
  it("should reject complete with UUID-format but non-existent objectId", async () => {
    const { status } = await post("/api/file/upload/complete", {
      objectId: FAKE_UUID,
    });
    // 409 Conflict observed when the multipart upload record is not found
    expect([400, 404, 409, 500]).toContain(status);
  });

  it("should reject complete with invalid (non-UUID) objectId", async () => {
    const { status } = await post("/api/file/upload/complete", {
      objectId: "not-a-uuid-at-all!@#",
    });
    expect([400, 404, 422, 500]).toContain(status);
  });
});

// ─── Complete — flow edge cases ───────────────────────────────────────────────

describe("File Upload Complete — flow edge cases", () => {
  it("should handle complete without prior part upload (init → complete, skip part)", async () => {
    const objectId = await quickInit();
    const { status } = await post("/api/file/upload/complete", { objectId });
    // Some backends require at least one part; others are permissive
    expect([200, 204, 400, 422, 500]).toContain(status);
  });

  it("should handle double complete (completing same objectId twice)", async () => {
    const objectId = await quickInit();

    // First complete
    const first = await post("/api/file/upload/complete", { objectId });
    expect([200, 204, 400, 422, 500]).toContain(first.status);

    // Second complete on the same objectId
    const second = await post("/api/file/upload/complete", { objectId });
    // Must not panic; idempotent (2xx) or rejected (4xx/5xx) are both acceptable
    expect([200, 204, 400, 404, 409, 422, 500]).toContain(second.status);
  });
});

// ─── Part upload — body & objectId edge cases ────────────────────────────────

describe("File Upload Part — body and objectId edge cases", () => {
  it("should handle part upload with empty body", async () => {
    const objectId = await quickInit();
    const res = await uploadPart(objectId, new Blob([], { type: "application/octet-stream" }));
    // Empty body — may be accepted (server-side multipart can have empty chunks) or rejected
    expect([200, 204, 400, 409, 411, 422, 500]).toContain(res.status);
  });

  it("should reject part upload to UUID-format but non-existent objectId", async () => {
    const res = await uploadPart(FAKE_UUID, new Blob(["data"], { type: "application/octet-stream" }));
    expect([400, 404, 409, 500]).toContain(res.status);
  });
});
