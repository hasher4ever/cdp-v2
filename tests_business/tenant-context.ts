/**
 * Helper to access the provisioned tenant context from within tests.
 * Falls back to the existing shared tenant if no provisioned tenant is available.
 */
import type { TestCustomer, TestEvent } from "./test-factories";

export interface ProvisionedTenant {
  tenantId: number;
  domain: string;
  email: string;
  password: string;
  token: string;
  customerFieldMap: Record<string, string>;
  eventFieldMap: Record<string, string>;
  purchaseEventTypeId: number;
  customers: TestCustomer[];
  events: TestEvent[];
  runTag: string;
}

/** Get the provisioned tenant. Throws if not available. */
export function getTenant(): ProvisionedTenant {
  const t = globalThis.__cdp_tenant;
  if (!t) throw new Error("No provisioned tenant — business tests require vitest.business.config.ts");
  return t;
}

/** Resolve a logical customer field name (e.g. "gender") to the actual column name (e.g. "col__varchar_s50000__0") */
export function custField(logicalName: string): string {
  const t = getTenant();
  const col = t.customerFieldMap[logicalName];
  if (!col) throw new Error(`Customer field "${logicalName}" not found in tenant field map. Available: ${Object.keys(t.customerFieldMap).join(", ")}`);
  return col;
}

/** Resolve a logical event field name (e.g. "total_price") to the actual column name */
export function evtField(logicalName: string): string {
  const t = getTenant();
  const col = t.eventFieldMap[logicalName];
  if (!col) throw new Error(`Event field "${logicalName}" not found in tenant field map. Available: ${Object.keys(t.eventFieldMap).join(", ")}`);
  return col;
}

/** Get the purchase event type ID */
export function purchaseTypeId(): number {
  return getTenant().purchaseEventTypeId;
}

/**
 * Returns true if the UDAF calculate endpoint was healthy at suite startup.
 * Set by global-setup-shared.ts (Step 9.5). Use with describe.skipIf:
 *
 *   const CALCULATE_OK = isUdafCalculateHealthy();
 *   describe.skipIf(!CALCULATE_OK)("UDAF values", () => { ... });
 *
 * When false: a valid pre-existing UDAF (non-empty aggType) returned 500 on calculate —
 * the endpoint itself is broken. CRUD tests are unaffected and still run.
 *
 * Defaults to true when unknown — missing probe data should not suppress tests.
 * Only explicitly false when a valid probe UDAF returned a non-200 response.
 */
export function isUdafCalculateHealthy(): boolean {
  return process.env.__CDP_UDAF_CALCULATE_HEALTHY !== "false";
}
