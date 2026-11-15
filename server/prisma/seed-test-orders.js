/**
 * More customer orders for local development and UI review.
 * Run AFTER seed.js and seed-test-data.js, with the API running:  node prisma/seed-test-orders.js
 *
 * Goes through the API so every order is created, costed and moved the way a user would do it
 * (import the BOM, set the price, release, start the build, deliver). Idempotent: an order whose
 * customer PO is already on the Orders list is skipped. Customer POs start with "TST-".
 *
 * Needs products that already have a BOM, so it uses whichever of PRD-001 to PRD-005 exist.
 * API address and admin login can be changed with API_URL, SEED_ADMIN_USER and SEED_ADMIN_PASSWORD.
 */
const API = (process.env.API_URL || 'http://localhost:5000') + '/api/v1';

const call = async (token, method, path, body) => {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new Error(`${method} ${path}: ${json?.error?.message || json?.message || res.status}`);
  return json.data;
};

// What each order is meant to show. margin is the selling price as a multiple of the cost per unit.
const ORDERS = [
  { po: 'TST-1001', product: 'PRD-002', client: 'Acme Corporation', qty: 2, start: '2026-08-03', delivery: '2026-09-14', margin: 1.35, end: 'DELIVERED', deliveredOn: '2026-09-10', notes: 'Delivered four days early' },
  { po: 'TST-1002', product: 'PRD-003', client: 'Globex Limited', qty: 3, start: '2026-08-17', delivery: '2026-10-05', margin: 1.25, end: 'DELIVERED', deliveredOn: '2026-10-12', notes: 'Delivered a week late' },
  { po: 'TST-1003', product: 'PRD-004', client: 'Globex Limited', qty: 2, start: '2026-09-07', delivery: '2026-10-30', margin: 1.4, end: 'DELIVERED', deliveredOn: '2026-10-28', notes: 'Delivered two days early' },
  { po: 'TST-1004', product: 'PRD-001', client: 'Acme Corporation', qty: 4, start: '2026-10-12', delivery: '2026-12-18', margin: 1.3, end: 'IN_BUILD', notes: 'In build, on track' },
  { po: 'TST-1005', product: 'PRD-005', client: 'Initech Solutions', qty: 2, start: '2026-10-26', delivery: '2027-01-15', margin: 1.3, end: 'RELEASED', notes: 'Released, not started' },
  { po: 'TST-1006', product: 'PRD-002', client: 'Acme Corporation', qty: 3, start: '2026-11-16', delivery: '2027-01-29', margin: 1.35, end: 'COMMITTED', notes: 'Committed, comfortable timeline' },
  { po: 'TST-1007', product: 'PRD-003', client: 'Globex Limited', qty: 1, start: '2026-10-01', delivery: '2026-11-06', margin: 1.2, end: 'IN_BUILD', notes: 'Past its promised date and still in build' },
  { po: 'TST-1008', product: 'PRD-004', client: 'Globex Limited', qty: 5, start: '2026-11-20', delivery: '2026-11-30', margin: 1.3, end: 'COMMITTED', notes: 'Parts cannot arrive in time for this date' },
  { po: 'TST-1009', product: 'PRD-001', client: 'Initech Solutions', qty: 1, start: '2026-12-01', delivery: '2027-03-31', margin: 1.3, end: 'COMMITTED', notes: 'Long lead, plenty of room' },
  { po: 'TST-1010', product: 'PRD-005', client: 'Initech Solutions', qty: 3, start: '2026-09-14', delivery: '2026-11-02', margin: 1.3, end: 'CANCELLED', notes: 'Customer withdrew the order' },
];

(async () => {
  const auth = await call(null, 'POST', '/auth/login', { username: process.env.SEED_ADMIN_USER || 'admin', password: process.env.SEED_ADMIN_PASSWORD || 'admin123' });
  const token = auth.accessToken;
  const [options, existing] = await Promise.all([call(token, 'GET', '/build-orders/options'), call(token, 'GET', '/build-orders')]);
  const products = new Map((options.products || []).map((p) => [p.code, p]));
  const clients = new Map((options.clients || []).map((c) => [c.name, c]));
  const have = new Set(existing.map((o) => o.customer_po));
  let made = 0; let skipped = 0;

  for (const o of ORDERS) {
    if (have.has(o.po)) { skipped++; continue; }
    const product = products.get(o.product); const client = clients.get(o.client);
    if (!product || !client) { console.log(`  skipped ${o.po}: ${!product ? `product ${o.product}` : `client ${o.client}`} not found`); skipped++; continue; }
    try {
      const { id } = await call(token, 'POST', '/build-orders', { product_id: product.id, client_id: client.id, quantity: o.qty, customer_po: o.po, start_date: o.start, delivery_date: o.delivery, notes: o.notes });
      await call(token, 'POST', `/build-orders/${id}/import-bom`, {});
      // Price the order from its own costed unit cost, so every order has a believable margin
      const costed = await call(token, 'GET', `/build-orders/${id}`);
      if (costed.unit_cost) await call(token, 'PUT', `/build-orders/${id}`, { unit_price: Math.round(costed.unit_cost * o.margin) });
      if (o.end !== 'COMMITTED' && o.end !== 'CANCELLED') await call(token, 'POST', `/build-orders/${id}/release`, {});
      if (o.end === 'IN_BUILD' || o.end === 'DELIVERED') await call(token, 'POST', `/build-orders/${id}/start`, {});
      if (o.end === 'DELIVERED') await call(token, 'POST', `/build-orders/${id}/deliver`, { delivered_on: o.deliveredOn });
      if (o.end === 'CANCELLED') await call(token, 'POST', `/build-orders/${id}/cancel`, { reason: o.notes });
      made++;
      console.log(`  ${costed.code} ${o.po}: ${o.end.toLowerCase().replace('_', ' ')}`);
    } catch (err) {
      console.log(`  could not finish ${o.po}: ${err.message}`);
    }
  }
  console.log(`Orders: ${made} created, ${skipped} skipped.`);
})().catch((err) => { console.error(err.message); process.exit(1); });
