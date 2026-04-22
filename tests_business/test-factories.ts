/**
 * Per-run test data factories.
 * Each call generates unique tagged data isolated from all prior runs.
 */
import { recordTiming, getAdaptiveTimeout } from "./timing-stats";

export type Gender = 'male' | 'female' | 'other';
export type PaymentType = 'card' | 'cash';
export type PurchaseStatus = 'completed' | 'pending';

const BASE_CITIES = ['Tashkent', 'Samarkand', 'Bukhara', 'Namangan', 'Andijan'];

/** Unique tag for this test run — used to namespace all created data */
export function makeTag(): string {
  return `T${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/** Random primary ID in range 9_000_000_000–9_799_999_999 (avoids fixed test range 9_9xx) */
export function makeId(): number {
  return 9_000_000_000 + Math.floor(Math.random() * 800_000_000);
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export interface TestCustomer {
  primary_id: number;
  first_name: string;
  last_name: string;
  email: string;
  gender: Gender;
  age: number;
  is_adult: boolean;
  is_subscribed: boolean;
  income: number;
  birthdate: string;
  phone_number: number;
  api_customer_name_first: string;
  api_customer_name_last: string;
}

export interface TestEvent {
  primary_id: number;
  event_type: 'purchase';
  purchase_id: string;
  purchase_status: PurchaseStatus;
  total_price: number;
  delivery_cost: number;
  delivery_city: string;
  delivery_country: string;
  payment_type: PaymentType;
  total_quantity: number;
}

/** Generate N customers with random attributes. All first_name prefixed with tag. */
export function makeCustomers(tag: string, count: number): TestCustomer[] {
  return Array.from({ length: count }, (_, i) => {
    const age = randInt(10, 75);
    const firstName = `${tag}_C${i}`;
    return {
      primary_id: makeId(),
      first_name: firstName,
      last_name: `Tst${i}`,
      email: `${tag}_c${i}@test.cdp`,
      gender: pick(['male', 'female', 'other'] as const),
      age,
      is_adult: age >= 18,
      is_subscribed: Math.random() > 0.5,
      income: pick([0, 0, randInt(10_000, 300_000)]),
      birthdate: `${randInt(1950, 2010)}-${String(randInt(1, 12)).padStart(2, '0')}-15`,
      phone_number: 7_000_000_000 + Math.floor(Math.random() * 999_999_999),
      api_customer_name_first: firstName,
      api_customer_name_last: `Tst${i}`,
    };
  });
}

/**
 * Build a single deterministic customer from a minimal spec.
 *
 * Use this for tests where specific field values matter (edge cases, boundary
 * tests, business-logic invariants). It auto-fills the derived/boring fields
 * (api_customer_name_*, email, phone_number, birthdate) from `i`+`tag` so the
 * test body only states what it cares about, and catches the common is_adult↔age
 * inconsistency bug at construction time.
 *
 * @param tag     run tag for namespacing names/emails
 * @param i       index (used for unique name/email/phone)
 * @param spec    required primary_id, gender, age, income, is_subscribed
 *                + optional overrides for last_name, first_name, email, etc.
 */
export function makeCustomerSpec(
  tag: string,
  i: number,
  spec: {
    primary_id: number;
    gender: Gender;
    age: number;
    income: number;
    is_subscribed: boolean;
    last_name?: string;
    first_name?: string;
    email?: string;
    birthdate?: string;
    phone_number?: number;
    // is_adult intentionally omitted — derived from age to prevent drift
  }
): TestCustomer {
  const first_name = spec.first_name ?? `${tag}_C${i}`;
  const last_name = spec.last_name ?? `Tst${i}`;
  const derivedIsAdult = spec.age >= 18;
  return {
    primary_id: spec.primary_id,
    first_name,
    last_name,
    api_customer_name_first: first_name,
    api_customer_name_last: last_name,
    email: spec.email ?? `${tag}_c${i}@test.cdp`,
    gender: spec.gender,
    age: spec.age,
    is_adult: derivedIsAdult,
    is_subscribed: spec.is_subscribed,
    income: spec.income,
    birthdate: spec.birthdate ?? `${2026 - spec.age}-01-01`,
    phone_number: spec.phone_number ?? 7_000_000_000 + i,
  };
}

/**
 * Assert that an array of customers is internally consistent. Throws on drift.
 * Use in beforeAll of tests that depend on specific per-customer invariants.
 */
export function assertCustomerInvariants(customers: TestCustomer[]): void {
  const problems: string[] = [];
  const ids = new Set<number>();
  for (const c of customers) {
    if (ids.has(c.primary_id)) problems.push(`duplicate primary_id ${c.primary_id}`);
    ids.add(c.primary_id);
    if ((c.age >= 18) !== c.is_adult) {
      problems.push(`${c.first_name}: age=${c.age} but is_adult=${c.is_adult}`);
    }
    if (c.age < 0 || c.age > 150) problems.push(`${c.first_name}: age=${c.age} out of range`);
    if (c.income < 0) problems.push(`${c.first_name}: income=${c.income} negative`);
  }
  if (problems.length > 0) {
    throw new Error(`Customer invariant violations:\n  - ${problems.join("\n  - ")}`);
  }
}

/**
 * Generate events for the given customers.
 * eventsPerCustomer: function returning how many events for customer index i
 * Cities are tagged so they're unique to this run: "Tashkent_<tag>"
 */
export function makeEvents(
  tag: string,
  customers: TestCustomer[],
  eventsPerCustomer: (i: number, cust: TestCustomer) => number
): TestEvent[] {
  const events: TestEvent[] = [];
  customers.forEach((c, i) => {
    const count = eventsPerCustomer(i, c);
    for (let j = 0; j < count; j++) {
      const baseCity = pick(BASE_CITIES);
      events.push({
        primary_id: c.primary_id,
        event_type: 'purchase',
        purchase_id: `${tag}_E${i}_${j}`,
        purchase_status: pick(['completed', 'pending'] as const),
        total_price: Number((randInt(1, 999) + Math.random()).toFixed(2)),
        delivery_cost: Number((randInt(0, 50) + Math.random()).toFixed(2)),
        delivery_city: `${baseCity}_${tag}`,
        delivery_country: 'UZ',
        payment_type: pick(['card', 'cash'] as const),
        total_quantity: randInt(1, 5),
      });
    }
  });
  return events;
}

/**
 * Timeout constant for tests that still need their own ingest+wait cycle
 * (write-heavy tests that create data beyond the shared dataset).
 */
export const SHARED_INGEST_TIMEOUT = 120_000;

/** Ingest customers + events and wait for data to be queryable. Returns when ready. */
export async function ingestAndWait(
  baseUrl: string,
  tenantId: number,
  token: string,
  customers: TestCustomer[],
  events: TestEvent[],
  timeoutMs?: number
): Promise<void> {
  const timeout = timeoutMs ?? getAdaptiveTimeout("ingestMs", 45_000);

  // Ingest customers and events in parallel
  const ingestPromises: Promise<Response>[] = [
    fetch(
      `${baseUrl}/cdp-ingest/ingest/tenant/${tenantId}/async/customers`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(customers) }
    ),
  ];
  if (events.length > 0) {
    ingestPromises.push(
      fetch(
        `${baseUrl}/cdp-ingest/ingest/tenant/${tenantId}/async/events`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(events) }
      )
    );
  }
  const [custRes, evtRes] = await Promise.all(ingestPromises);
  if (!custRes.ok) throw new Error(`Customer ingest failed: ${custRes.status}`);
  if (evtRes && !evtRes.ok) throw new Error(`Event ingest failed: ${evtRes.status}`);

  // Poll until first customer is queryable
  const targetId = customers[0].primary_id;
  const deadline = Date.now() + timeout;
  const start = Date.now();
  while (Date.now() < deadline) {
    const r = await fetch(`${baseUrl}/api/tenant/data/customers/${targetId}`,
      { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 200) {
      const d = await r.json();
      if (d.fields && Object.keys(d.fields).length > 2) {
        recordTiming("ingestMs", Date.now() - start);
        return;
      }
    }
    await new Promise(res => setTimeout(res, 2_000));
  }
  // Don't throw — let tests decide what to do with missing data
  console.warn(`[ingestAndWait] Timed out waiting for customer ${targetId}`);
}

/**
 * Build a v2 filter predicate that scopes to specific primary_ids.
 * Use as the first predicate in an AND group to isolate test data.
 */
export function primaryIdScopePredicate(ids: number[]) {
  return {
    type: "condition" as const,
    condition: {
      operator: "in",
      param: { fieldName: "primary_id", kind: "field" },
      value: { int64: ids, string: [], float64: [], bool: [], time: [] },
    },
  };
}

/**
 * Wrap predicates into a v2 filter object with AND group.
 */
export function v2Filter(predicates: any[]) {
  return {
    intersects: {
      customPredicate: {
        type: "group",
        group: {
          logicalOp: "AND",
          negate: false,
          predicates,
        },
      },
    },
  };
}

/**
 * Build a single condition predicate for v2 queries.
 */
export function v2Cond(fieldName: string, operator: string, value: {
  string?: string[];
  int64?: number[];
  float64?: number[];
  bool?: boolean[];
  time?: string[];
}) {
  return {
    type: "condition" as const,
    condition: {
      operator,
      param: { fieldName, kind: "field" },
      value: {
        string: value.string ?? [],
        int64: value.int64 ?? [],
        float64: value.float64 ?? [],
        bool: value.bool ?? [],
        time: value.time ?? [],
      },
    },
  };
}
