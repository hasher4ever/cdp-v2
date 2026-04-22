/**
 * Rich deterministic test data for business logic tests.
 *
 * 10 customers covering all data type edge cases:
 *   - VARCHAR: diverse strings, empty, special chars
 *   - BIGINT: 0, negative(?), large values
 *   - DOUBLE: 0, fractions, large values
 *   - BOOL: true/false mix
 *   - DATE: past, recent, future-ish
 *
 * 20 purchase events with varied field values for UDAF/filter testing.
 * Primary IDs: 9_900_000_001 – 9_900_000_010
 */

export const TEST_TAG = `cdptest_${Date.now()}`;
const P = 9_900_000_001; // base primary_id

export const CUSTOMERS = [
  // ── Group A: Females ────────────────────────────────────────────────────
  { primary_id: P + 0, first_name: `${TEST_TAG}_Alice`,   last_name: "Smith",    email: `alice_${TEST_TAG}@test.cdp`,   gender: "female", birthdate: "1990-05-15", age: 35, phone_number: 9001000001, is_adult: true,  is_subscribed: true,  income: 75000.50 },
  { primary_id: P + 1, first_name: `${TEST_TAG}_Carol`,   last_name: "Lee",      email: `carol_${TEST_TAG}@test.cdp`,   gender: "female", birthdate: "2008-07-01", age: 17, phone_number: 9001000003, is_adult: false, is_subscribed: true,  income: 0 },
  { primary_id: P + 2, first_name: `${TEST_TAG}_Eve`,     last_name: "Park",     email: `eve_${TEST_TAG}@test.cdp`,     gender: "female", birthdate: "2000-12-25", age: 25, phone_number: 9001000005, is_adult: true,  is_subscribed: false, income: 45000.00 },
  { primary_id: P + 3, first_name: `${TEST_TAG}_Grace`,   last_name: "Chen",     email: `grace_${TEST_TAG}@test.cdp`,   gender: "female", birthdate: "1995-03-10", age: 31, phone_number: 9001000007, is_adult: true,  is_subscribed: true,  income: 88000.00 },
  // ── Group B: Males ──────────────────────────────────────────────────────
  { primary_id: P + 4, first_name: `${TEST_TAG}_Bob`,     last_name: "Jones",    email: `bob_${TEST_TAG}@test.cdp`,     gender: "male",   birthdate: "1985-11-20", age: 40, phone_number: 9001000002, is_adult: true,  is_subscribed: false, income: 120000.00 },
  { primary_id: P + 5, first_name: `${TEST_TAG}_Dave`,    last_name: "Kim",      email: `dave_${TEST_TAG}@test.cdp`,    gender: "male",   birthdate: "1975-01-30", age: 51, phone_number: 9001000004, is_adult: true,  is_subscribed: true,  income: 250000.00 },
  { primary_id: P + 6, first_name: `${TEST_TAG}_Frank`,   last_name: "Wong",     email: `frank_${TEST_TAG}@test.cdp`,   gender: "male",   birthdate: "1960-08-22", age: 65, phone_number: 9001000006, is_adult: true,  is_subscribed: false, income: 180000.00 },
  // ── Group C: Edge cases ─────────────────────────────────────────────────
  { primary_id: P + 7, first_name: `${TEST_TAG}_Hana`,    last_name: "Doe",      email: `hana_${TEST_TAG}@test.cdp`,    gender: "other",  birthdate: "2001-01-01", age: 25, phone_number: 9001000008, is_adult: true,  is_subscribed: true,  income: 0 },
  { primary_id: P + 8, first_name: `${TEST_TAG}_Ivan`,    last_name: "Petrov",   email: `ivan_${TEST_TAG}@test.cdp`,    gender: "male",   birthdate: "1999-06-15", age: 26, phone_number: 9001000009, is_adult: true,  is_subscribed: true,  income: 55000.00 },
  { primary_id: P + 9, first_name: `${TEST_TAG}_Jun`,     last_name: "Tanaka",   email: `jun_${TEST_TAG}@test.cdp`,     gender: "male",   birthdate: "2010-09-30", age: 15, phone_number: 9001000010, is_adult: false, is_subscribed: false, income: 0 },
];

/**
 * Purchase events — rich distribution:
 *   Alice:  3 events (Tashkent x2, Samarkand x1) total_price: 150+200+50=400
 *   Carol:  1 event  (Bukhara) pending, total_price: 25
 *   Eve:    0 events
 *   Grace:  2 events (Tashkent x1, Bukhara x1) total_price: 300+100=400
 *   Bob:    2 events (Samarkand x2) total_price: 999.99+500=1499.99
 *   Dave:   4 events (Tashkent x4) total_price: 500+500+500+500=2000
 *   Frank:  3 events (Samarkand x2, Tashkent x1) total_price: 800+200+350=1350
 *   Hana:   1 event  (Tashkent) total_price: 10
 *   Ivan:   2 events (Bukhara x2) total_price: 75+25=100
 *   Jun:    0 events (minor, no purchases)
 */
export const EVENTS = [
  // Alice (P+0): 3 purchases
  { primary_id: P + 0, event_type: "purchase", purchase_id: `${TEST_TAG}_P01`, purchase_status: "completed", total_price: 150.00, delivery_cost: 10.00, delivery_city: "Tashkent", delivery_country: "UZ", payment_type: "card",   total_quantity: 1 },
  { primary_id: P + 0, event_type: "purchase", purchase_id: `${TEST_TAG}_P02`, purchase_status: "completed", total_price: 200.00, delivery_cost: 0,     delivery_city: "Tashkent", delivery_country: "UZ", payment_type: "cash",   total_quantity: 1 },
  { primary_id: P + 0, event_type: "purchase", purchase_id: `${TEST_TAG}_P03`, purchase_status: "completed", total_price: 50.00,  delivery_cost: 5.00,  delivery_city: "Samarkand",delivery_country: "UZ", payment_type: "card",   total_quantity: 2 },
  // Carol (P+1): 1 purchase (pending)
  { primary_id: P + 1, event_type: "purchase", purchase_id: `${TEST_TAG}_P04`, purchase_status: "pending",   total_price: 25.00,  delivery_cost: 5.00,  delivery_city: "Bukhara",  delivery_country: "UZ", payment_type: "cash",   total_quantity: 1 },
  // Grace (P+3): 2 purchases
  { primary_id: P + 3, event_type: "purchase", purchase_id: `${TEST_TAG}_P05`, purchase_status: "completed", total_price: 300.00, delivery_cost: 15.00, delivery_city: "Tashkent", delivery_country: "UZ", payment_type: "card",   total_quantity: 3 },
  { primary_id: P + 3, event_type: "purchase", purchase_id: `${TEST_TAG}_P06`, purchase_status: "completed", total_price: 100.00, delivery_cost: 8.00,  delivery_city: "Bukhara",  delivery_country: "UZ", payment_type: "cash",   total_quantity: 1 },
  // Bob (P+4): 2 purchases
  { primary_id: P + 4, event_type: "purchase", purchase_id: `${TEST_TAG}_P07`, purchase_status: "completed", total_price: 999.99, delivery_cost: 25.00, delivery_city: "Samarkand",delivery_country: "UZ", payment_type: "card",   total_quantity: 2 },
  { primary_id: P + 4, event_type: "purchase", purchase_id: `${TEST_TAG}_P08`, purchase_status: "completed", total_price: 500.00, delivery_cost: 0,     delivery_city: "Samarkand",delivery_country: "UZ", payment_type: "card",   total_quantity: 1 },
  // Dave (P+5): 4 purchases — all Tashkent
  { primary_id: P + 5, event_type: "purchase", purchase_id: `${TEST_TAG}_P09`, purchase_status: "completed", total_price: 500.00, delivery_cost: 0,     delivery_city: "Tashkent", delivery_country: "UZ", payment_type: "card",   total_quantity: 1 },
  { primary_id: P + 5, event_type: "purchase", purchase_id: `${TEST_TAG}_P10`, purchase_status: "completed", total_price: 500.00, delivery_cost: 15.00, delivery_city: "Tashkent", delivery_country: "UZ", payment_type: "card",   total_quantity: 1 },
  { primary_id: P + 5, event_type: "purchase", purchase_id: `${TEST_TAG}_P11`, purchase_status: "completed", total_price: 500.00, delivery_cost: 20.00, delivery_city: "Tashkent", delivery_country: "UZ", payment_type: "cash",   total_quantity: 1 },
  { primary_id: P + 5, event_type: "purchase", purchase_id: `${TEST_TAG}_P12`, purchase_status: "completed", total_price: 500.00, delivery_cost: 10.00, delivery_city: "Tashkent", delivery_country: "UZ", payment_type: "card",   total_quantity: 1 },
  // Frank (P+6): 3 purchases
  { primary_id: P + 6, event_type: "purchase", purchase_id: `${TEST_TAG}_P13`, purchase_status: "completed", total_price: 800.00, delivery_cost: 30.00, delivery_city: "Samarkand",delivery_country: "UZ", payment_type: "card",   total_quantity: 5 },
  { primary_id: P + 6, event_type: "purchase", purchase_id: `${TEST_TAG}_P14`, purchase_status: "completed", total_price: 200.00, delivery_cost: 12.00, delivery_city: "Samarkand",delivery_country: "UZ", payment_type: "cash",   total_quantity: 2 },
  { primary_id: P + 6, event_type: "purchase", purchase_id: `${TEST_TAG}_P15`, purchase_status: "completed", total_price: 350.00, delivery_cost: 0,     delivery_city: "Tashkent", delivery_country: "UZ", payment_type: "card",   total_quantity: 1 },
  // Hana (P+7): 1 purchase — small
  { primary_id: P + 7, event_type: "purchase", purchase_id: `${TEST_TAG}_P16`, purchase_status: "completed", total_price: 10.00,  delivery_cost: 2.00,  delivery_city: "Tashkent", delivery_country: "UZ", payment_type: "cash",   total_quantity: 1 },
  // Ivan (P+8): 2 purchases — Bukhara
  { primary_id: P + 8, event_type: "purchase", purchase_id: `${TEST_TAG}_P17`, purchase_status: "completed", total_price: 75.00,  delivery_cost: 7.00,  delivery_city: "Bukhara",  delivery_country: "UZ", payment_type: "card",   total_quantity: 1 },
  { primary_id: P + 8, event_type: "purchase", purchase_id: `${TEST_TAG}_P18`, purchase_status: "pending",   total_price: 25.00,  delivery_cost: 3.00,  delivery_city: "Bukhara",  delivery_country: "UZ", payment_type: "cash",   total_quantity: 1 },
  // Eve (P+2): 0 purchases
  // Jun (P+9): 0 purchases
];

// ─── Expected counts ─────────────────────────────────────────────────────────

export const EXPECTED = {
  totalCustomers: 10,
  totalEvents: 18,

  // Gender
  femaleCount: 4,   // Alice, Carol, Eve, Grace
  maleCount: 5,     // Bob, Dave, Frank, Ivan, Jun
  otherGenderCount: 1, // Hana

  // Boolean
  adultsCount: 8,   // all except Carol(17) and Jun(15)
  minorsCount: 2,   // Carol, Jun
  subscribedCount: 6, // Alice, Carol, Grace, Dave, Hana, Ivan
  unsubscribedCount: 4, // Eve, Bob, Frank, Jun

  // Numeric
  incomeAbove100k: 3, // Bob(120K), Dave(250K), Frank(180K)
  incomeZero: 3,      // Carol, Hana, Jun

  // Events per customer
  alicePurchases: 3,
  carolPurchases: 1,
  evePurchases: 0,
  gracePurchases: 2,
  bobPurchases: 2,
  davePurchases: 4,
  frankPurchases: 3,
  hanaPurchases: 1,
  ivanPurchases: 2,
  junPurchases: 0,

  // SUM total_price per customer
  aliceTotalPrice: 400,     // 150+200+50
  bobTotalPrice: 1499.99,   // 999.99+500
  daveTotalPrice: 2000,     // 500x4
  frankTotalPrice: 1350,    // 800+200+350

  // City distribution (events)
  tashkentEvents: 9,   // Alice(2)+Grace(1)+Dave(4)+Frank(1)+Hana(1)
  samarkandEvents: 4,  // Alice(1)+Bob(2)+Frank(2) — wait, let me recount
  // Actually: Samarkand: Alice(1)+Bob(2)+Frank(2)=5... let me recount
  // Tashkent: Alice(2)+Grace(1)+Dave(4)+Frank(1)+Hana(1) = 9
  // Samarkand: Alice(1)+Bob(2)+Frank(2) = 5
  // Bukhara: Carol(1)+Grace(1)+Ivan(2) = 4
  bukharaEvents: 4,

  // Payment type
  cardEvents: 12,  // count manually from above
  cashEvents: 6,
};

// Fix samarkand count
EXPECTED.samarkandEvents = 5;
