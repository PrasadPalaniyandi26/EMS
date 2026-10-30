// End-to-end smoke test against the running app (no extra packages). Run: npm run test:smoke
// Needs the API (default http://localhost:5000) and the web app (default http://localhost:3000) running,
// with the seeded admin user. Override with API_URL, WEB_URL, SMOKE_USER, SMOKE_PASS.
const API = process.env.API_URL ?? 'http://localhost:5000/api/v1';
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const USER = process.env.SMOKE_USER ?? 'admin';
const PASS = process.env.SMOKE_PASS ?? 'admin123';

const PAGES = [
  '/login', '/', '/hub', '/expense', '/income', '/transactions', '/approvals', '/notifications', '/reporting', '/settings',
  '/analytics/resource-utilization', '/budget/planner', '/budget/monitor', '/budget/alerts', '/budget/settings', '/manage/clients', '/manage/organization', '/manage/products',
  '/manage/projects', '/manage/recurring', '/system/audit-log',
];
const ENDPOINTS = [
  '/transactions?limit=5', '/transactions?type=expense&excludeStatus=APPROVED,REJECTED&limit=5', '/approvals/pending', '/approvals/history',
  '/categories', '/clients', '/projects', '/products', '/budgets/plans', '/budgets/monitor', '/budgets/alerts', '/recurring', '/users', '/roles', '/dashboard/summary',
  '/notifications?limit=5', '/notifications/unread-count', '/audit?limit=5',
];

let failed = 0;
const ok = (name, good, extra = '') => { console.log(`${good ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!good) failed++; };

async function main() {
  const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: USER, password: PASS }) });
  const body = await login.json().catch(() => ({}));
  const token = body?.data?.accessToken ?? body?.data?.access_token;
  ok('API login', login.ok && !!token, `HTTP ${login.status}`);
  if (!token) { console.log('Cannot continue without a token.'); process.exit(1); }

  for (const e of ENDPOINTS) {
    const r = await fetch(`${API}${e}`, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json().catch(() => null);
    ok(`GET ${e}`, r.ok && j?.success !== false, `HTTP ${r.status}`);
  }

  // Wrong password must be a clean 401, not a server error
  const bad = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: USER, password: 'wrong-password' }) });
  ok('Wrong password is rejected', bad.status === 401, `HTTP ${bad.status}`);

  // No token must be rejected
  const anon = await fetch(`${API}/transactions?limit=1`);
  ok('Unauthenticated request is rejected', anon.status === 401, `HTTP ${anon.status}`);

  // Role rules: an employee must not reach admin-only data (uses the seeded test user emp1; skipped if absent)
  const emp = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'emp1', password: 'Test@1234' }) });
  const empToken = (await emp.json().catch(() => ({})))?.data?.accessToken;
  if (empToken) {
    const audit = await fetch(`${API}/audit?limit=1`, { headers: { Authorization: `Bearer ${empToken}` } });
    ok('Employee is refused the audit log', audit.status === 403, `HTTP ${audit.status}`);
    const mine = await fetch(`${API}/transactions?limit=1`, { headers: { Authorization: `Bearer ${empToken}` } });
    ok('Employee can read their own transactions', mine.ok, `HTTP ${mine.status}`);
  } else {
    console.log('SKIP  employee role checks (test user emp1 not seeded)');
  }

  for (const p of PAGES) {
    const r = await fetch(`${WEB}${p}`, { redirect: 'manual' });
    ok(`PAGE ${p}`, r.status === 200, `HTTP ${r.status}`);
  }

  console.log(failed === 0 ? '\nSmoke test passed.' : `\n${failed} check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
