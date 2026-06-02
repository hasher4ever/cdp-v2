/**
 * Categorizations — quantile-bucket bins over a customer field or UDAF.
 * Endpoints live in `claude-agent` (production) but are NOT in dev2.
 *
 * Contract reminders (from openapi/clustermeta.yaml):
 *  - tiers: minItems=2 maxItems=10; each {label, threshold}; threshold is cumulative
 *    percentile 0..1; last MUST be 1.0
 *  - source_kind: "field" | "udaf"; field requires source_field_name; udaf requires source_udaf_id
 *  - PUT defaults to PREVIEW mode (applied=false) when dependent segments exist;
 *    force=true applies and returns updated CategorizationInfo
 *  - DELETE is soft; 409 if segments still reference; 204 on success
 *  - Response includes `rev` (bumped on tier-affecting updates) and `current_breakpoint`
 *
 * Shared tenant has ~20 customers — `small_population:true` is expected on every breakpoint.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { get, post, put, del } from "../tests_backend/client";
import { getTenant, custField } from "./tenant-context";

const t = getTenant();
const TAG = t.runTag;

// Track everything we create so afterAll can clean up
const createdIds: string[] = [];

const tiersBasic = [
  { label: "low",  threshold: 0.33 },
  { label: "mid",  threshold: 0.66 },
  { label: "high", threshold: 1.0  },
];

async function createCat(overrides: Record<string, unknown> = {}) {
  const body = {
    name: `${TAG}_cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    source_kind: "field",
    source_field_name: custField("age"),
    tiers: tiersBasic,
    ...overrides,
  };
  const r = await post("/api/tenants/categorizations", body);
  if (r.status === 200 && r.data?.id) createdIds.push(r.data.id);
  return r;
}

afterAll(async () => {
  for (const id of createdIds) {
    try { await del(`/api/tenants/categorizations/${id}`); } catch { /* ignore */ }
  }
});

// ─── Shape & roundtrip ─────────────────────────────────────────────────────────

describe("Categorizations: create → roundtrip", () => {
  let catId: string;

  beforeAll(async () => {
    const r = await createCat();
    expect(r.status).toBe(200);
    expect(r.data).toHaveProperty("id");
    catId = r.data.id;
  });

  it("response includes id, rev, tiers, current_breakpoint", async () => {
    const r = await get(`/api/tenants/categorizations/${catId}`);
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({
      id: catId,
      source_kind: "field",
      source_field_name: custField("age"),
    });
    expect(r.data.tiers).toHaveLength(3);
    expect(typeof r.data.rev).toBe("number");
    expect(r.data.rev).toBeGreaterThanOrEqual(1);
    expect(r.data.created_at).toBeTruthy();
    expect(r.data.updated_at).toBeTruthy();
  });

  it("current_breakpoint reflects small_population on shared tenant (<1000 customers)", async () => {
    const r = await get(`/api/tenants/categorizations/${catId}`);
    expect(r.status).toBe(200);
    // breakpoint may be null if compute hasn't returned yet — accept either, but
    // if present it MUST flag small_population (shared tenant has ~20 customers)
    const bp = r.data.current_breakpoint;
    if (bp) {
      expect(bp.small_population).toBe(true);
      expect(typeof bp.customer_count).toBe("number");
      expect(Array.isArray(bp.breakpoints)).toBe(true);
      // breakpoints array length = tiers.length - 1 (interior cut points)
      expect(bp.breakpoints.length).toBe(tiersBasic.length - 1);
      expect(bp.categorization_rev).toBe(r.data.rev);
    }
  });

  it("list contains the created categorization", async () => {
    const r = await get("/api/tenants/categorizations");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data.items)).toBe(true);
    const found = r.data.items.find((c: { id: string }) => c.id === catId);
    expect(found).toBeTruthy();
  });
});

// ─── Validation ────────────────────────────────────────────────────────────────

describe("Categorizations: input validation", () => {
  it("rejects fewer than 2 tiers (minItems)", async () => {
    const r = await createCat({ tiers: [{ label: "only", threshold: 1.0 }] });
    expect(r.status).toBe(400);
  });

  it("rejects more than 10 tiers (maxItems)", async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      label: `t${i}`,
      threshold: (i + 1) / 11,
    }));
    many[10].threshold = 1.0;
    const r = await createCat({ tiers: many });
    expect(r.status).toBe(400);
  });

  it("rejects last tier threshold != 1.0", async () => {
    const r = await createCat({
      tiers: [
        { label: "a", threshold: 0.5 },
        { label: "b", threshold: 0.9 },
      ],
    });
    expect(r.status).toBe(400);
  });

  it("rejects non-monotonic thresholds", async () => {
    const r = await createCat({
      tiers: [
        { label: "a", threshold: 0.7 },
        { label: "b", threshold: 0.3 },
        { label: "c", threshold: 1.0 },
      ],
    });
    expect(r.status).toBe(400);
  });

  it("rejects threshold outside [0, 1]", async () => {
    const r = await createCat({
      tiers: [
        { label: "a", threshold: -0.1 },
        { label: "b", threshold: 1.5 },
      ],
    });
    expect(r.status).toBe(400);
  });

  it("source_kind=field requires source_field_name", async () => {
    const r = await createCat({ source_field_name: null });
    expect([400, 422]).toContain(r.status);
  });

  it("source_kind=udaf requires source_udaf_id (and field omitted)", async () => {
    const r = await createCat({
      source_kind: "udaf",
      source_field_name: null,
      source_udaf_id: null,
    });
    expect([400, 422]).toContain(r.status);
  });

  it("rejects invalid source_kind enum", async () => {
    const r = await createCat({ source_kind: "nonsense" });
    expect(r.status).toBe(400);
  });

  it("rejects empty name", async () => {
    const r = await createCat({ name: "" });
    expect([400, 422]).toContain(r.status);
  });
});

// ─── Update / refresh / rev semantics ──────────────────────────────────────────

describe("Categorizations: update + refresh", () => {
  let catId: string;
  let initialRev: number;

  beforeAll(async () => {
    const r = await createCat();
    expect(r.status).toBe(200);
    catId = r.data.id;
    initialRev = r.data.rev;
  });

  it("PUT without dependent segments applies immediately (applied:true)", async () => {
    const r = await put(`/api/tenants/categorizations/${catId}`, {
      name: `${TAG}_renamed`,
    });
    expect(r.status).toBe(200);
    expect(r.data).toHaveProperty("applied");
    // With no dependent segments, name-only update should apply directly
    expect(r.data.applied).toBe(true);
    expect(r.data.categorization).toBeTruthy();
    expect(r.data.categorization.name).toBe(`${TAG}_renamed`);
  });

  it("Refresh updates current_breakpoint (rev unchanged — tiers didn't change)", async () => {
    const before = await get(`/api/tenants/categorizations/${catId}`);
    const r = await post(`/api/tenants/categorizations/${catId}/refresh`);
    expect(r.status).toBe(200);
    expect(r.data.id).toBe(catId);
    expect(r.data.rev).toBe(before.data.rev); // refresh doesn't bump rev
    if (r.data.current_breakpoint && before.data.current_breakpoint) {
      // computed_at must move forward
      expect(new Date(r.data.current_breakpoint.computed_at).getTime())
        .toBeGreaterThanOrEqual(new Date(before.data.current_breakpoint.computed_at).getTime());
    }
  });

  it("Tier change bumps rev when applied", async () => {
    const newTiers = [
      { label: "bottom", threshold: 0.25 },
      { label: "mid",    threshold: 0.75 },
      { label: "top",    threshold: 1.0  },
    ];
    const r = await put(`/api/tenants/categorizations/${catId}`, { tiers: newTiers });
    expect(r.status).toBe(200);
    if (r.data.applied) {
      expect(r.data.categorization.rev).toBeGreaterThan(initialRev);
      expect(r.data.categorization.tiers).toHaveLength(3);
    }
  });
});

// ─── Delete / soft-delete ──────────────────────────────────────────────────────

describe("Categorizations: delete semantics", () => {
  it("DELETE on non-existent ID returns 404", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const r = await del(`/api/tenants/categorizations/${fakeId}`);
    expect(r.status).toBe(404);
  });

  it("DELETE round-trip: create → delete → GET 404", async () => {
    const c = await createCat();
    expect(c.status).toBe(200);
    const id = c.data.id;

    const d = await del(`/api/tenants/categorizations/${id}`);
    expect([200, 204]).toContain(d.status);

    // Remove from cleanup list since we just deleted it
    const idx = createdIds.indexOf(id);
    if (idx >= 0) createdIds.splice(idx, 1);

    const g = await get(`/api/tenants/categorizations/${id}`);
    expect(g.status).toBe(404);
  });
});
