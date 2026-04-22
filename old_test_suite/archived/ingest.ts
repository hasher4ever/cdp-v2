/** CDP Ingest API client — public endpoints, no auth required */

const BASE_URL = process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz";
const TENANT_ID = process.env.CDP_TENANT_ID || "1762934640267";

export async function ingestCustomers(customers: Record<string, unknown>[]): Promise<IngestResult> {
  const res = await fetch(`${BASE_URL}/cdp-ingest/ingest/tenant/${TENANT_ID}/async/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(customers),
  });
  if (!res.ok && res.status !== 200) {
    const text = await res.text();
    throw new Error(`Ingest customers failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<IngestResult>;
}

export async function ingestEvents(events: Record<string, unknown>[]): Promise<IngestResult> {
  const res = await fetch(`${BASE_URL}/cdp-ingest/ingest/tenant/${TENANT_ID}/async/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(events),
  });
  if (!res.ok && res.status !== 200) {
    const text = await res.text();
    throw new Error(`Ingest events failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<IngestResult>;
}

export interface IngestResult {
  accepted: number;
  rejected: number;
  items: { status: "accepted" | "rejected"; ignoredFields: string[]; error?: { key: string; message: string } }[];
}
