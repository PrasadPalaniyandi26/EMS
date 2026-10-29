/**
 * Test-data seed for local development and UI review.
 * Run AFTER prisma/seed.js:  node prisma/seed-test-data.js
 *
 * Creates sample users (every role), clients, projects, products, ~100 transactions
 * in every workflow state, budgets, recurring schedules, approvals, notifications
 * and audit entries. All test users share the password below.
 * Idempotent: exits without changes if the test users already exist.
 * Data is deterministic (seeded RNG), so every run produces the same dataset.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test@1234';

// ── deterministic RNG ──
let seed = 20261028;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const round2 = (n) => Math.round(n * 100) / 100;

const TODAY = new Date(Date.UTC(2026, 9, 28)); // 2026-10-28
const daysAgo = (n) => new Date(TODAY.getTime() - n * 86400000);
const ref = (id, type) => `${type === 'expense' ? 'EXP' : 'INC'}-${String(10000 + id).padStart(5, '0')}`;

function gst(entered, rate, included) {
  const r = rate || 0;
  if (!r) return { amount: entered, netAmount: entered, totalAmount: entered, gstRate: null, gstIncluded: false };
  if (included) {
    return { amount: entered, netAmount: round2(entered / (1 + r / 100)), totalAmount: entered, gstRate: r, gstIncluded: true };
  }
  const total = round2(entered * (1 + r / 100));
  return { amount: total, netAmount: entered, totalAmount: total, gstRate: r, gstIncluded: false };
}

async function main() {
  console.log('Seeding test data...\n');

  if (await prisma.user.findUnique({ where: { username: 'fin1' } })) {
    console.log('Test users already exist - nothing to do. (Recreate the DB to reseed: docker compose down -v)');
    return;
  }

  const roles = Object.fromEntries((await prisma.role.findMany()).map((r) => [r.name, r.id]));
  if (!roles.ADMIN) throw new Error('Run prisma/seed.js first.');
  const hash = await bcrypt.hash(TEST_PASSWORD, 10);
  const admin = await prisma.user.findUnique({ where: { username: 'admin' } });

  // ── Users ──
  const defs = [
    { username: 'fin1', role: 'FINANCE', dept: 'Finance', city: 'Mumbai' },
    { username: 'fin2', role: 'FINANCE', dept: 'Finance', city: 'Mumbai' },
    { username: 'mgr1', role: 'MANAGER', dept: 'Engineering', city: 'Pune' },
    { username: 'mgr2', role: 'MANAGER', dept: 'Sales', city: 'Bengaluru' },
    { username: 'emp1', role: 'EMPLOYEE', dept: 'Engineering', city: 'Pune', mgr: 'mgr1' },
    { username: 'emp2', role: 'EMPLOYEE', dept: 'Engineering', city: 'Pune', mgr: 'mgr1' },
    { username: 'emp3', role: 'EMPLOYEE', dept: 'Sales', city: 'Bengaluru', mgr: 'mgr2' },
    { username: 'emp4', role: 'EMPLOYEE', dept: 'Sales', city: 'Delhi', mgr: 'mgr2' },
    { username: 'emp5', role: 'EMPLOYEE', dept: 'Sales', city: 'Delhi', mgr: 'mgr2', status: 'ON_HOLD' },
  ];
  const users = { admin };
  for (const d of defs) {
    const u = await prisma.user.create({
      data: {
        username: d.username, loginName: d.username, email: `${d.username}@ems.test`,
        passwordHash: hash, role: d.role.toLowerCase(), roleId: roles[d.role],
        managerId: d.mgr ? users[d.mgr].id : null,
        isActive: d.active !== false, userStatus: d.status || 'ACTIVE',
        department: d.dept, city: d.city, country: 'India', currency: 'INR',
        contactNo: `+91 98765 ${String(40000 + defs.indexOf(d))}`,
        joiningDate: daysAgo(between(200, 1200)),
      },
    });
    await prisma.userRole.create({ data: { userId: u.id, roleId: roles[d.role], isDefault: true } });
    await prisma.userPermission.create({
      data: {
        userId: u.id, permissions: {},
        singleLimit: d.role === 'EMPLOYEE' ? 25000 : 100000,
        monthlyLimit: d.role === 'EMPLOYEE' ? 100000 : 500000,
        dataScope: d.role === 'EMPLOYEE' ? 'Own' : 'Department',
      },
    });
    users[d.username] = u;
  }
  // One manager who is also an employee (multi-role)
  await prisma.userRole.create({ data: { userId: users.mgr1.id, roleId: roles.EMPLOYEE, isDefault: false } });
  await prisma.userRole.create({ data: { userId: admin.id, roleId: roles.FINANCE, isDefault: false } });
  console.log(`  users: ${defs.length} (password ${TEST_PASSWORD})`);

  // ── Clients, projects, products ──
  const clientDefs = [
    { name: 'Acme Corporation', code: 'ACME', type: 'Manufacturing', contact: 'Rita Sharma', active: true },
    { name: 'Globex Limited', code: 'GLBX', type: 'Technology', contact: 'Arjun Mehta', active: true },
    { name: 'Initech Solutions', code: 'INIT', type: 'Consulting', contact: 'Neha Kapoor', active: true },
    { name: 'Umbrella Industries', code: 'UMBR', type: 'Healthcare', contact: 'Vikram Rao', active: false },
  ];
  const clients = [];
  const projects = [];
  const products = [];
  let pn = 1;
  for (const c of clientDefs) {
    const client = await prisma.client.create({
      data: {
        name: c.name, code: c.code, businessType: c.type, isActive: c.active, country: 'India',
        contactName: c.contact, contactEmail: `${c.code.toLowerCase()}@client.test`, contactPhone: '+91 22 5555 0100',
        address: '100 Test Street, Mumbai', createdBy: admin.id, description: `${c.name} - sample client`,
      },
    });
    clients.push(client);
    // Types are shared by every client, so create them once
    const pt = await prisma.projectType.upsert({ where: { name: 'Implementation' }, update: {}, create: { name: 'Implementation', createdBy: admin.id } });
    const prt = await prisma.productType.upsert({ where: { name: 'Software' }, update: {}, create: { name: 'Software', createdBy: admin.id } });
    for (let i = 1; i <= 2; i++) {
      projects.push(await prisma.project.create({
        data: {
          clientId: client.id, typeId: pt.id, name: `${c.code} Project ${i}`, code: `PRJ-${String(pn).padStart(3, '0')}`,
          status: i === 2 && !c.active ? 'Closed' : 'Active', lead_id: users.mgr1.id, budget: between(2, 12) * 100000,
          start_date: daysAgo(300), end_date: daysAgo(-120), category: 'Delivery', isActive: c.active, createdBy: admin.id,
        },
      }));
      products.push(await prisma.product.create({
        data: {
          clientId: client.id, typeId: prt.id, name: `${c.code} Product ${i}`, code: `PRD-${String(pn).padStart(3, '0')}`,
          status: pick(['R&D', 'Pilot', 'Production']), lead_id: users.mgr2.id, budget: between(1, 8) * 100000,
          start_date: daysAgo(250), category: 'Platform', isActive: c.active, createdBy: admin.id,
        },
      }));
      pn++;
    }
  }
  console.log(`  clients: ${clients.length}, projects: ${projects.length}, products: ${products.length}`);

  // ── Transactions ──
  const expCats = (await prisma.category.findMany({ where: { type: 'expense' } })).map((c) => c.id);
  const incCats = (await prisma.category.findMany({ where: { type: 'income' } })).map((c) => c.id);
  const activeClients = clients.filter((c) => c.isActive);
  const methods = ['cash', 'card', 'bank_transfer', 'upi'];
  const notes = ['Client lunch', 'Taxi to site', 'Software licence', 'Team offsite', 'Conference pass', 'Office supplies', 'Courier charges', 'Hotel stay', 'Flight ticket', 'Broadband bill', 'Training course', 'Printer toner'];
  const statuses = ['APPROVED', 'APPROVED', 'APPROVED', 'APPROVED', 'APPROVED', 'PENDING_MANAGER', 'PENDING_FINANCE', 'REJECTED', 'DRAFT', 'SENT_BACK'];
  const spenders = ['emp1', 'emp2', 'emp3', 'emp4', 'mgr1', 'mgr2', 'fin1', 'admin'];
  const finance = users.fin1;
  let created = 0;

  for (const uname of spenders) {
    const u = users[uname];
    const mgr = u.managerId ? await prisma.user.findUnique({ where: { id: u.managerId } }) : null;
    const approverL1 = mgr || finance;
    for (let i = 0; i < 14; i++) {
      let status = statuses[i % statuses.length];
      // Managers, finance and admin have no manager level: their expenses go straight to Finance
      if (!mgr && status === 'PENDING_MANAGER') status = 'PENDING_FINANCE';
      const useProject = rnd() > 0.35;
      const client = pick(activeClients);
      const proj = projects.find((p) => p.clientId === client.id && p.isActive);
      const prod = products.find((p) => p.clientId === client.id && p.isActive);
      const entered = round2(between(300, 28000) + rnd());
      const rate = pick([0, 5, 12, 18, 18]);
      const g = gst(entered, rate, rnd() > 0.5);
      const date = daysAgo(between(1, 180));
      const reimburse = rnd() > 0.7;
      const base = {
        userId: u.id, type: 'expense', dateRecorded: date, categoryId: pick(expCats),
        description: `${pick(notes)} (${uname})`, paymentMethod: pick(methods),
        clientId: client.id, contextType: useProject ? 'project' : 'product',
        projectId: useProject ? proj.id : null, productId: useProject ? null : prod.id,
        receiptNumber: `RC-${between(1000, 9999)}`, currency: 'INR', ...g,
        needsReimbursement: reimburse, isClaimable: rnd() > 0.6,
        submittedAt: status === 'DRAFT' || status === 'SENT_BACK' ? null : new Date(date.getTime() + 3600000 * 5),
        submittedById: status === 'DRAFT' ? null : u.id, submittedByName: status === 'DRAFT' ? null : u.username,
      };
      const t = await prisma.transaction.create({ data: { ...base, status: status === 'SENT_BACK' ? 'DRAFT' : status } });
      const upd = { referenceId: ref(t.id, 'expense') };
      const reqs = [];
      const at = new Date(date.getTime() + 86400000);
      if (status === 'PENDING_MANAGER') {
        reqs.push({ approverId: approverL1.id, levelNum: 1, status: 'PENDING' });
      } else if (status === 'PENDING_FINANCE') {
        if (mgr) reqs.push({ approverId: mgr.id, levelNum: 1, status: 'APPROVED', actionDate: at, resolvedAt: at, comments: 'Looks fine' });
        reqs.push({ approverId: u.id === finance.id ? users.fin2.id : finance.id, levelNum: mgr ? 2 : 1, status: 'PENDING' });
      } else if (status === 'APPROVED') {
        const fin = u.id === finance.id ? users.fin2 : finance;
        if (mgr) reqs.push({ approverId: mgr.id, levelNum: 1, status: 'APPROVED', actionDate: at, resolvedAt: at });
        reqs.push({ approverId: fin.id, levelNum: mgr ? 2 : 1, status: 'APPROVED', actionDate: new Date(at.getTime() + 86400000), resolvedAt: new Date(at.getTime() + 86400000) });
        Object.assign(upd, { approvedById: fin.id, approvedByName: fin.username, approvedByRole: 'FINANCE', approvedAt: new Date(at.getTime() + 86400000) });
        if (reimburse) {
          if (rnd() > 0.5) Object.assign(upd, { reimbursementStatus: 'PAID', reimbursedAt: new Date(at.getTime() + 3 * 86400000), reimbursedById: fin.id, reimbursedByName: fin.username, reimbursementReference: `NEFT${between(100000, 999999)}` });
          else if (rnd() > 0.7) upd.reimbursementStatus = 'ON_HOLD';
        }
      } else if (status === 'REJECTED') {
        reqs.push({ approverId: approverL1.id, levelNum: 1, status: 'REJECTED', actionDate: at, resolvedAt: at, comments: 'Receipt missing / not billable' });
        Object.assign(upd, { rejectedById: approverL1.id, rejectedByName: approverL1.username, rejectedByRole: approverL1.role?.toUpperCase(), rejectedAt: at });
      } else if (status === 'SENT_BACK') {
        Object.assign(upd, { sentBackById: approverL1.id, sentBackByName: approverL1.username, sentBackByRole: approverL1.role?.toUpperCase(), sentBackAt: at, submittedById: u.id, submittedByName: u.username });
        await prisma.transactionNote.create({ data: { transactionId: t.id, userId: approverL1.id, note: 'Please attach the invoice and resubmit.' } });
      }
      await prisma.transaction.update({ where: { id: t.id }, data: upd });
      for (const r of reqs) await prisma.approvalRequest.create({ data: { transactionId: t.id, ...r } });
      await prisma.auditLog.create({ data: { tableName: 'transactions', recordId: t.id, referenceId: upd.referenceId, action: 'INSERT', changedBy: u.id, changedAt: date, newValues: JSON.stringify({ status: 'DRAFT', amount: g.totalAmount }) } });
      created++;
    }
  }

  // Income: auto-approved, entered by finance/admin
  for (let i = 0; i < 18; i++) {
    const u = i % 3 === 0 ? admin : users.fin1;
    const client = pick(activeClients);
    const g = gst(between(20000, 400000), pick([0, 18]), false);
    const date = daysAgo(between(1, 180));
    const t = await prisma.transaction.create({
      data: {
        userId: u.id, type: 'income', dateRecorded: date, categoryId: pick(incCats),
        description: `${pick(['Invoice payment', 'Retainer', 'Milestone payment', 'Interest credit'])} - ${client.name}`,
        paymentMethod: pick(['bank_transfer', 'upi']), clientId: client.id, contextType: 'project',
        projectId: projects.find((p) => p.clientId === client.id).id, currency: 'INR', ...g,
        status: 'APPROVED', submittedAt: date, submittedById: u.id, submittedByName: u.username,
        approvedById: u.id, approvedByName: u.username, approvedByRole: u.role?.toUpperCase(), approvedAt: date,
      },
    });
    await prisma.transaction.update({ where: { id: t.id }, data: { referenceId: ref(t.id, 'income') } });
    created++;
  }
  // A couple of near-duplicates and a split + voided entry for the duplicate/void UI
  const e1 = await prisma.transaction.findFirst({ where: { type: 'expense', status: 'APPROVED', userId: users.emp1.id } });
  if (e1) {
    const dup = await prisma.transaction.create({
      data: { userId: e1.userId, type: 'expense', dateRecorded: e1.dateRecorded, categoryId: e1.categoryId, description: `${e1.description} (possible duplicate)`, paymentMethod: e1.paymentMethod, clientId: e1.clientId, contextType: e1.contextType, projectId: e1.projectId, productId: e1.productId, currency: 'INR', amount: e1.amount, netAmount: e1.netAmount, totalAmount: e1.totalAmount, gstRate: e1.gstRate, gstIncluded: e1.gstIncluded, status: 'DRAFT' },
    });
    await prisma.transaction.update({ where: { id: dup.id }, data: { referenceId: ref(dup.id, 'expense') } });
    created++;
  }
  console.log(`  transactions: ${created}`);

  // ── Budgets (current + previous month; some intentionally tight) ──
  let budgets = 0;
  const budgetOwners = ['emp1', 'emp2', 'emp3', 'emp4', 'mgr1', 'mgr2', 'fin1', 'admin'];
  for (const [mIdx, month] of [[0, 10], [1, 9]]) {
    for (const uname of budgetOwners) {
      for (const cat of expCats.slice(0, 4)) {
        const limit = pick([3000, 8000, 15000, 40000]);
        await prisma.budget.create({
          data: {
            userId: users[uname].id, categoryId: cat, monthlyLimit: limit, amount: limit, periodMonth: month, periodYear: 2026,
            code: `BUD-${month}-${users[uname].id}-${cat}`, name: `${uname} category ${cat} - ${month}/2026`,
            department: users[uname].department, owner_id: users[uname].managerId || users.fin1.id, financial_year: 2026,
            start_date: new Date(Date.UTC(2026, month - 1, 1)), end_date: new Date(Date.UTC(2026, month, 0)),
            strict_enforcement: mIdx === 0 ? rnd() > 0.5 : false, auto_rollover: rnd() > 0.7,
          },
        });
        budgets++;
      }
      await prisma.monthlyBudgetSetting.create({ data: { userId: users[uname].id, periodMonth: month, periodYear: 2026, additionalAllocation: between(0, 5) * 1000, rolloverEnabled: rnd() > 0.5 } });
    }
  }
  console.log(`  budgets: ${budgets}`);

  // ── Recurring schedules ──
  const rec = async (data) => prisma.recurringTransaction.create({ data: { currency: 'INR', contextType: 'project', ...data } });
  const acme = clients[0];
  const r1 = await rec({ userId: users.emp1.id, amount: 1499, totalAmount: 1499, netAmount: 1270.34, gstRate: 18, gstIncluded: true, categoryId: 12, description: 'Broadband subscription', paymentMethod: 'card', frequency: 'monthly', nextRunDate: daysAgo(-5), startDate: daysAgo(150), type: 'expense', status: 'APPROVED', clientId: acme.id, projectId: projects[0].id, submittedByName: 'emp1', approvedById: users.fin1.id, approvedByName: 'fin1', approvedByRole: 'FINANCE' });
  const r2 = await rec({ userId: users.mgr1.id, amount: 45000, totalAmount: 45000, netAmount: 45000, categoryId: 17, description: 'Office rent - Pune', paymentMethod: 'bank_transfer', frequency: 'monthly', nextRunDate: daysAgo(-2), startDate: daysAgo(300), type: 'expense', status: 'PENDING_FINANCE', clientId: 1, projectId: 1, submittedByName: 'mgr1' });
  const r3 = await rec({ userId: users.emp3.id, amount: 2500, totalAmount: 2500, netAmount: 2500, categoryId: 11, description: 'Weekly cab pass', paymentMethod: 'upi', frequency: 'weekly', nextRunDate: daysAgo(-3), startDate: daysAgo(60), type: 'expense', status: 'PENDING_MANAGER', clientId: clients[1].id, projectId: projects[2].id, submittedByName: 'emp3' });
  await rec({ userId: users.fin1.id, amount: 150000, totalAmount: 150000, netAmount: 150000, categoryId: incCats[0], description: 'Retainer - Acme', paymentMethod: 'bank_transfer', frequency: 'monthly', nextRunDate: daysAgo(-10), startDate: daysAgo(200), type: 'income', status: 'APPROVED', clientId: acme.id, projectId: projects[0].id, submittedByName: 'fin1' });
  await rec({ userId: users.emp2.id, amount: 999, totalAmount: 999, netAmount: 999, categoryId: 13, description: 'Streaming for demo room', paymentMethod: 'card', frequency: 'monthly', nextRunDate: daysAgo(-12), type: 'expense', status: 'DRAFT', clientId: 1, projectId: 1, submittedByName: 'emp2' });
  await prisma.approvalRequest.create({ data: { recurringTransactionId: r2.id, approverId: users.fin1.id, levelNum: 1, status: 'PENDING' } });
  await prisma.approvalRequest.create({ data: { recurringTransactionId: r3.id, approverId: users.mgr2.id, levelNum: 1, status: 'PENDING' } });
  console.log('  recurring: 5');

  // ── Notifications ──
  const notif = [
    [users.mgr1, 'approval', 'Expense awaiting your approval', 'emp1 submitted an expense for approval.'],
    [users.mgr2, 'approval', 'Expense awaiting your approval', 'emp3 submitted an expense for approval.'],
    [users.fin1, 'approval', 'Expense awaiting finance approval', 'An expense is pending finance approval.'],
    [users.emp1, 'info', 'Expense approved', 'Your expense was approved by fin1.'],
    [users.emp2, 'warning', 'Expense sent back', 'Please attach the invoice and resubmit.'],
    [users.emp3, 'error', 'Expense rejected', 'Receipt missing / not billable.'],
    [admin, 'info', 'Welcome', 'Test dataset loaded.'],
  ];
  for (const [u, type, title, message] of notif) await prisma.notification.create({ data: { userId: u.id, type, title, message, isRead: rnd() > 0.6 } });

  // ── Reset sequences ──
  for (const [t, c] of [['users', 'id'], ['clients', 'id'], ['projects', 'id'], ['products', 'id'], ['transactions', 'id'], ['budgets', 'id'], ['recurring_transactions', 'id'], ['approval_requests', 'request_id']]) {
    await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('${t}', '${c}'), COALESCE(MAX(${c}), 1)) FROM ${t}`);
  }

  console.log('\nTest data complete. Login: admin / admin123, or fin1, fin2, mgr1, mgr2, emp1..emp4 / ' + TEST_PASSWORD);
}

main()
  .catch((e) => { console.error('Seed error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
