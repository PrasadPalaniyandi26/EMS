import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// Life cycle of the main records on the real database: client, project, product, parts and alternates,
// budget, build order, expense (submit, approve, send back, reject, void), income and recurring.
// Test data uses the "ZZ" prefix and is removed before and after the run.
type Res = { status: number; body: any };

describe('Life cycle (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string;
  let fin: string;
  let mgr: string;
  let emp: string;
  let emp2: string;
  let clientId: number;
  let projectId: number;
  let productId: number;
  let categoryId: number;
  let partA: number;
  let partB: number;
  let partC: number;
  let buildOrderId: number;
  let txExpense: number;
  let txRejected: number;
  let txSentBack: number;
  let txVoided: number;
  let txIncome: number;
  let recurringId: number;
  let currentFy: number;
  let typeId: number;
  const today = () => new Date().toISOString().slice(0, 10);
  const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  const call = async (method: 'get' | 'post' | 'put' | 'delete', url: string, token: string, body?: unknown): Promise<Res> => {
    let res: Res = { status: 0, body: {} };
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = request(app.getHttpServer())[method](`/api/v1${url}`).set('Authorization', `Bearer ${token}`);
      const out = body === undefined ? await r : await r.send(body as object);
      res = { status: out.status, body: out.body };
      if (out.status !== 429) return res;
      await new Promise((resolve) => setTimeout(resolve, 12000));
    }
    return res;
  };
  // Actions answer 200 or 201 depending on the endpoint; any 2xx is success
  const expectOk = (r: Res, _status: number, label: string) => {
    if (r.status < 200 || r.status > 299) throw new Error(`${label}: expected success, got ${r.status}: ${JSON.stringify(r.body?.error ?? r.body)}`);
    return r.body?.data;
  };
  const login = async (username: string, password: string) => {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password });
    if (!r.body?.data?.accessToken) throw new Error(`Login failed for ${username} (${r.status})`);
    return r.body.data.accessToken as string;
  };
  const cleanup = async () => {
    await prisma.approvalRequest.deleteMany({ where: { OR: [{ transaction: { description: { startsWith: 'ZZ ' } } }, { recurringTransaction: { description: { startsWith: 'ZZ ' } } }] } });
    await prisma.transactionNote.deleteMany({ where: { transaction: { description: { startsWith: 'ZZ ' } } } });
    await prisma.transaction.deleteMany({ where: { OR: [{ description: { startsWith: 'ZZ ' } }, { description: { startsWith: '[AUTO] ZZ ' } }] } });
    await prisma.recurringTransaction.deleteMany({ where: { description: { startsWith: 'ZZ ' } } });
    const prods = (await prisma.product.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((p) => p.id);
    await prisma.buildOrder.deleteMany({ where: { productId: { in: prods } } });
    await prisma.productionPlan.deleteMany({ where: { productId: { in: prods } } });
    await prisma.bomLine.deleteMany({ where: { bom: { productId: { in: prods } } } });
    await prisma.bom.deleteMany({ where: { productId: { in: prods } } });
    await prisma.product.deleteMany({ where: { name: { startsWith: 'ZZ ' } } });
    const projs = (await prisma.project.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((p) => p.id);
    await prisma.budgetLine.deleteMany({ where: { OR: [{ productId: { in: prods } }, { projectId: { in: projs } }] } });
    await prisma.budgetPlan.deleteMany({ where: { name: { startsWith: 'ZZ ' } } });
    await prisma.project.deleteMany({ where: { name: { startsWith: 'ZZ ' } } });
    await prisma.client.deleteMany({ where: { name: { startsWith: 'ZZ ' } } });
    await prisma.itemPriceLog.deleteMany({ where: { item: { partNo: { startsWith: 'ZZ-' } } } });
    await prisma.partReplacement.deleteMany({ where: { item: { partNo: { startsWith: 'ZZ-' } } } });
    await prisma.item.updateMany({ where: { partNo: { startsWith: 'ZZ-' } }, data: { alternateGroupId: null, isDefaultAlternate: false } });
    await prisma.item.deleteMany({ where: { partNo: { startsWith: 'ZZ-' } } });
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    await cleanup();
    admin = await login('admin', 'admin123');
    fin = await login('fin1', 'Test@1234');
    mgr = await login('mgr1', 'Test@1234');
    emp = await login('emp1', 'Test@1234');
    emp2 = await login('emp2', 'Test@1234');
    categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true, type: 'expense' }, orderBy: { id: 'asc' } })).id;
  }, 60000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('Client, project and product', () => {
    it('creates a client, normalising a GSTIN typed with spaces', async () => {
      const c = expectOk(await call('post', '/clients', admin, { name: 'ZZ Client', country: 'India', state: 'Maharashtra', gstin: '27 AAAPL1234C1Z5', payment_terms_days: 30 }), 201, 'create client');
      clientId = c.id;
      expect(c.gstin).toBe('27AAAPL1234C1Z5');
    });

    it('creates a project and a product under the client', async () => {
      const p = expectOk(await call('post', '/projects', admin, { name: 'ZZ Project', client_id: clientId, status: 'Active', start_date: today(), end_date: inDays(120) }), 201, 'create project');
      projectId = p.id;
      expect(p.code).toMatch(/^PRJ-/);
      const pr = expectOk(await call('post', '/products', admin, { name: 'ZZ Product', client_id: clientId, status: 'R&D', start_date: today() }), 201, 'create product');
      productId = pr.id;
      expect(pr.code).toMatch(/^PRD-/);
    });

    it('rejects a duplicate project name for the same client', async () => {
      const r = await call('post', '/projects', admin, { name: 'zz project', client_id: clientId, status: 'Active' });
      expect(r.status).toBe(409);
    });
  });

  describe('Parts, alternates and replacement', () => {
    const part = async (no: string, price: number) => expectOk(await call('post', '/budgets/items', admin, { part_no: no, name: `ZZ ${no}`, sourcing: 'BUY', standard_price: price, uom: 'nos', oem_part_no: `OEM-${no}`, lead_time_days: 5 }), 201, `create ${no}`).id as number;

    it('creates parts with a standard price and lead time', async () => {
      partA = await part('ZZ-A1', 100);
      partB = await part('ZZ-B1', 110);
      partC = await part('ZZ-C1', 90);
      const r = await call('post', '/budgets/items', admin, { part_no: 'ZZ-NOLEAD', name: 'ZZ no lead', sourcing: 'BUY', standard_price: 10, uom: 'nos', oem_part_no: 'X' });
      expect(r.status).toBe(400);
    });

    it('links an alternate, makes the first part the default group member, and refuses a second group', async () => {
      expectOk(await call('post', `/budgets/items/${partA}/alternates`, admin, { alternate_id: partB }), 201, 'add alternate');
      const a = await prisma.item.findUniqueOrThrow({ where: { id: partA } });
      const b = await prisma.item.findUniqueOrThrow({ where: { id: partB } });
      expect(a.alternateGroupId).not.toBeNull();
      expect(b.alternateGroupId).toBe(a.alternateGroupId);
      expect(a.isDefaultAlternate).toBe(true);
      expect(b.isDefaultAlternate).toBe(false);
      const again = await call('post', `/budgets/items/${partC}/alternates`, admin, { alternate_id: partB });
      expect(again.status).toBeGreaterThanOrEqual(400);
    });

    it('moves the default alternate to the second part', async () => {
      expectOk(await call('put', `/budgets/items/${partB}/default-alternate`, admin), 200, 'default alternate');
      expect((await prisma.item.findUniqueOrThrow({ where: { id: partB } })).isDefaultAlternate).toBe(true);
      expect((await prisma.item.findUniqueOrThrow({ where: { id: partA } })).isDefaultAlternate).toBe(false);
    });

    it('schedules a replacement and then cancels it, leaving the old part active', async () => {
      const rep = expectOk(await call('post', `/budgets/items/${partC}/replace`, admin, { successor_id: partA, effective_from: inDays(30), reason: 'Supplier change' }), 201, 'replace');
      expect(await prisma.partReplacement.count({ where: { itemId: partC, status: 'SCHEDULED' } })).toBe(1);
      expectOk(await call('delete', `/budgets/part-replacements/${rep.id ?? rep.replacement_id ?? (await prisma.partReplacement.findFirstOrThrow({ where: { itemId: partC } })).id}`, admin), 200, 'cancel replacement');
      expect((await prisma.item.findUniqueOrThrow({ where: { id: partC } })).status).toBe('ACTIVE');
    });

    it('updates the part, then records purchases: the last paid price follows the latest purchase date, not the order entered', async () => {
      expectOk(await call('put', `/budgets/items/${partA}`, admin, { part_no: 'ZZ-A1', name: 'ZZ A1 renamed', sourcing: 'BUY', standard_price: 105, uom: 'nos', oem_part_no: 'OEM-ZZ-A1', lead_time_days: 7 }), 200, 'update part');
      const upd = await prisma.item.findUniqueOrThrow({ where: { id: partA } });
      expect(upd.name).toBe('ZZ A1 renamed');
      expect(Number(upd.standardPrice)).toBe(105);
      expect(upd.leadTimeDays).toBe(7);
      expectOk(await call('post', `/budgets/items/${partA}/purchase`, admin, { price: 98, paid_on: inDays(-5), supplier: 'ZZ Supplier' }), 201, 'purchase 1');
      expectOk(await call('post', `/budgets/items/${partA}/purchase`, admin, { price: 110, paid_on: today(), supplier: 'ZZ Supplier' }), 201, 'purchase 2');
      expectOk(await call('post', `/budgets/items/${partA}/purchase`, admin, { price: 50, paid_on: inDays(-20) }), 201, 'purchase 3 (older)');
      expect(Number((await prisma.item.findUniqueOrThrow({ where: { id: partA } })).lastPrice)).toBe(110);
      const future = await call('post', `/budgets/items/${partA}/purchase`, admin, { price: 1, paid_on: inDays(3) });
      expect(future.status).toBe(400);
    });

    it('rejects a replacement whose effective date is in the past', async () => {
      const r = await call('post', `/budgets/items/${partC}/replace`, admin, { successor_id: partA, effective_from: inDays(-5), reason: 'x' });
      expect(r.status).toBe(400);
    });
  });

  describe('Budget and allocation', () => {
    it('allocates a project line in the current financial year, against the expense type of the category', async () => {
      const fy = expectOk(await call('get', '/budgets/fiscal-year', admin), 200, 'fiscal year');
      currentFy = Number(fy?.current_fy);
      expect(Number.isInteger(currentFy)).toBe(true);
      const cat = await prisma.category.findFirstOrThrow({ where: { type: 'expense', isActive: true, typeId: { not: null } }, orderBy: { id: 'asc' } });
      categoryId = cat.id;
      typeId = cat.typeId!;
      if (!(await prisma.budgetPlan.findUnique({ where: { fy: currentFy } }))) {
        expectOk(await call('post', '/budgets/plans', admin, { fy: currentFy, name: 'ZZ Plan current' }), 201, 'create plan');
      }
      const plan = await prisma.budgetPlan.findUniqueOrThrow({ where: { fy: currentFy } });
      const line = await call('post', '/budgets/lines', admin, { plan_id: plan.id, cost_object: 'PROJECT', project_id: projectId, type_id: typeId, control_level: 'TYPE', total: 500000, reason: 'ZZ allocation' });
      expectOk(line, 201, 'create budget line');
    });

    it('stores the allocation as monthly periods that add up to the planned amount', async () => {
      const row = await prisma.budgetLine.findFirst({ where: { projectId, isActive: true } });
      expect(row).not.toBeNull();
      const periods = await prisma.budgetLinePeriod.findMany({ where: { lineId: row!.id } });
      const total = periods.reduce((s, p) => s + Number(p.amount), 0);
      expect(Math.round(total)).toBe(500000);
    });

    it('does not allocate the same project and type twice in the same plan', async () => {
      const plan = await prisma.budgetPlan.findUniqueOrThrow({ where: { fy: currentFy } });
      const r = await call('post', '/budgets/lines', admin, { plan_id: plan.id, cost_object: 'PROJECT', project_id: projectId, type_id: typeId, control_level: 'TYPE', total: 1000, reason: 'dup' });
      expect(r.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Project estimate, baseline and burn', () => {
    it('adds estimate lines, proposes a baseline, and Finance approves it', async () => {
      expectOk(await call('post', `/budgets/projects/${projectId}/estimate-lines`, admin, { phase: 'Design', description: 'ZZ design hours', quantity: 10, rate: 1000, unit: 'hrs' }), 201, 'estimate line');
      expectOk(await call('post', `/budgets/projects/${projectId}/baseline`, admin, {}), 201, 'propose baseline');
      const proposed = await prisma.estimateBaseline.findFirstOrThrow({ where: { projectId, status: 'PROPOSED' }, orderBy: { id: 'desc' } });
      const again = await call('post', `/budgets/projects/${projectId}/baseline`, admin, {});
      expect(again.status).toBe(409);
      expectOk(await call('post', `/budgets/baselines/${proposed.id}/approve`, fin, {}), 201, 'approve baseline');
      expect((await prisma.estimateBaseline.findUniqueOrThrow({ where: { id: proposed.id } })).status).toBe('APPROVED');
    });
  });

  describe('Build order from product to delivery', () => {
    it('creates an order, adds an operation and moves it through release, start and deliver', async () => {
      expectOk(await call('post', `/budgets/products/${productId}/bom-lines`, admin, { item_id: partA, quantity: 2, group_name: 'Frame', sequence: 1 }), 201, 'product BOM line');
      const backwards = await call('post', '/build-orders', admin, { product_id: productId, client_id: clientId, quantity: 2, start_date: inDays(30), delivery_date: inDays(10) });
      expect(backwards.status).toBe(400);
      const o = expectOk(await call('post', '/build-orders', admin, { product_id: productId, client_id: clientId, quantity: 2, start_date: today(), delivery_date: inDays(60), unit_price: 1000 }), 201, 'create order');
      buildOrderId = o.id;
      expectOk(await call('post', `/build-orders/${buildOrderId}/import-bom`, admin, {}), 201, 'import BOM');
      const opType = await prisma.operationType.findFirstOrThrow({ where: { isActive: true, isFixed: false, isOutsourced: false } });
      const rate = await prisma.rateCard.findFirstOrThrow({ where: { isActive: true } });
      expectOk(await call('post', `/build-orders/${buildOrderId}/operations`, admin, { operation_type_id: opType.id, rate_card_id: rate.id, hours: 2, sequence: 1 }), 201, 'add operation');
      const bomLine = await prisma.bomLine.findFirstOrThrow({ where: { bom: { buildOrderId } } });
      expect(bomLine.itemId).toBe(partA);
      const notAlternate = await call('post', `/build-orders/${buildOrderId}/lines/${bomLine.id}/swap`, admin, { item_id: partC });
      expect(notAlternate.status).toBe(409);
      expectOk(await call('post', `/build-orders/${buildOrderId}/lines/${bomLine.id}/swap`, admin, { item_id: partB }), 201, 'swap to alternate');
      expect((await prisma.bomLine.findUniqueOrThrow({ where: { id: bomLine.id } })).itemId).toBe(partB);
      expectOk(await call('post', `/build-orders/${buildOrderId}/release`, admin, {}), 201, 'release');
      const early = await call('post', `/build-orders/${buildOrderId}/deliver`, admin, {});
      expect(early.status).toBeGreaterThanOrEqual(400);
      expectOk(await call('post', `/build-orders/${buildOrderId}/start`, admin, {}), 201, 'start');
      expectOk(await call('post', `/build-orders/${buildOrderId}/deliver`, admin, {}), 201, 'deliver');
      const row = await prisma.buildOrder.findUniqueOrThrow({ where: { id: buildOrderId } });
      expect(row.status).toBe('DELIVERED');
    });

    it('does not allow a delivered order to be changed', async () => {
      const r = await call('put', `/build-orders/${buildOrderId}`, admin, { quantity: 5 });
      expect(r.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Expense: submit, approve, send back, reject, void', () => {
    const expense = async (token: string, description: string, extra: Record<string, unknown> = {}) =>
      expectOk(await call('post', '/transactions', token, { type: 'expense', amount: 1500, dateRecorded: today(), description, paymentMethod: 'cash', categoryId, contextType: 'project', projectId, ...extra }), 201, `create ${description}`).id as number;
    const approvalFor = (txId: number) => prisma.approvalRequest.findFirst({ where: { transactionId: txId, status: 'PENDING' }, orderBy: { id: 'desc' } });

    it('records an expense as DRAFT with a reference code', async () => {
      txExpense = await expense(emp, 'ZZ Travel to site');
      const row = await prisma.transaction.findUniqueOrThrow({ where: { id: txExpense } });
      expect(row.status).toBe('DRAFT');
      expect(row.referenceId).toMatch(/^EXP-/);
    });

    it('submits to the manager, who approves it, then finance approves it', async () => {
      expectOk(await call('post', `/transactions/${txExpense}/submit`, emp, {}), 201, 'submit');
      expect((await prisma.transaction.findUniqueOrThrow({ where: { id: txExpense } })).status).toBe('PENDING_MANAGER');
      const managerReq = await approvalFor(txExpense);
      expect(managerReq).not.toBeNull();
      expectOk(await call('post', `/approvals/${managerReq!.id}/approve`, mgr, { comments: 'ok' }), 201, 'manager approve');
      expect((await prisma.transaction.findUniqueOrThrow({ where: { id: txExpense } })).status).toBe('PENDING_FINANCE');
      const finReq = await approvalFor(txExpense);
      expectOk(await call('post', `/approvals/${finReq!.id}/approve`, fin, {}), 201, 'finance approve');
      const done = await prisma.transaction.findUniqueOrThrow({ where: { id: txExpense } });
      expect(done.status).toBe('APPROVED');
      expect(done.approvedById).not.toBeNull();
    });

    it('sends back an expense so the employee can edit it, and then clears the pending request', async () => {
      txSentBack = await expense(emp2, 'ZZ Sent back claim');
      expectOk(await call('post', `/transactions/${txSentBack}/submit`, emp2, {}), 201, 'submit sent-back');
      const req = await approvalFor(txSentBack);
      expectOk(await call('post', `/approvals/${req!.id}/send-back`, mgr, { comments: 'Add the receipt' }), 201, 'send back');
      const row = await prisma.transaction.findUniqueOrThrow({ where: { id: txSentBack } });
      expect(row.status).toBe('SENT_BACK');
      expect(await prisma.approvalRequest.count({ where: { transactionId: txSentBack, status: 'PENDING' } })).toBe(0);
    });

    it('rejects an expense with a reason and marks it REJECTED', async () => {
      txRejected = await expense(emp, 'ZZ Rejected claim');
      expectOk(await call('post', `/transactions/${txRejected}/submit`, emp, {}), 201, 'submit reject');
      const req = await approvalFor(txRejected);
      expectOk(await call('post', `/approvals/${req!.id}/reject`, mgr, { comments: 'Not a project cost' }), 201, 'reject');
      expect((await prisma.transaction.findUniqueOrThrow({ where: { id: txRejected } })).status).toBe('REJECTED');
    });

    it('voids an approved expense only with a reason', async () => {
      txVoided = await expense(emp, 'ZZ Void me');
      expectOk(await call('post', `/transactions/${txVoided}/submit`, emp, {}), 201, 'submit void');
      expectOk(await call('post', `/approvals/${(await approvalFor(txVoided))!.id}/approve`, mgr, {}), 201, 'mgr approve void');
      expectOk(await call('post', `/approvals/${(await approvalFor(txVoided))!.id}/approve`, fin, {}), 201, 'fin approve void');
      const noReason = await call('post', `/transactions/${txVoided}/void`, admin, { reason: '' });
      expect(noReason.status).toBeGreaterThanOrEqual(400);
      expectOk(await call('post', `/transactions/${txVoided}/void`, admin, { reason: 'Duplicate of another claim' }), 201, 'void');
      expect((await prisma.transaction.findUniqueOrThrow({ where: { id: txVoided } })).status).toBe('VOIDED');
    });

    it('does not let an employee approve their own expense', async () => {
      const own = await expense(emp, 'ZZ self approve');
      expectOk(await call('post', `/transactions/${own}/submit`, emp, {}), 201, 'submit self');
      const req = await approvalFor(own);
      const r = await call('post', `/approvals/${req!.id}/approve`, emp, {});
      expect(r.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Income and recurring', () => {
    it('records income as a draft that employees cannot submit', async () => {
      txIncome = expectOk(await call('post', '/transactions', mgr, { type: 'income', amount: 25000, dateRecorded: today(), description: 'ZZ Client payment', paymentMethod: 'bank', categoryId, clientId, contextType: 'project', projectId }), 201, 'create income').id;
      const row = await prisma.transaction.findUniqueOrThrow({ where: { id: txIncome } });
      expect(row.type).toBe('income');
      expect(row.status).toBe('DRAFT');
      expect(row.referenceId).toMatch(/^INC-/);
      const own = expectOk(await call('post', '/transactions', emp, { type: 'income', amount: 100, dateRecorded: today(), description: 'ZZ Employee income', paymentMethod: 'bank', categoryId, contextType: 'project', projectId }), 201, 'employee income').id;
      const denied = await call('post', `/transactions/${own}/submit`, emp, {});
      expect(denied.status).toBe(403);
      // Another person's record is not visible to an employee
      expect((await call('post', `/transactions/${txIncome}/submit`, emp, {})).status).toBe(404);
    });

    it('takes income through Finance approval: the manager submits, Finance approves, and it is then counted', async () => {
      expectOk(await call('post', `/transactions/${txIncome}/submit`, mgr, {}), 201, 'submit income');
      expect((await prisma.transaction.findUniqueOrThrow({ where: { id: txIncome } })).status).toBe('PENDING_FINANCE');
      const req = await prisma.approvalRequest.findFirst({ where: { transactionId: txIncome, status: 'PENDING' } });
      expect(req).not.toBeNull();
      expectOk(await call('post', `/approvals/${req!.id}/approve`, fin, {}), 201, 'finance approve income');
      expect((await prisma.transaction.findUniqueOrThrow({ where: { id: txIncome } })).status).toBe('APPROVED');
    });

    it('creates a recurring expense and does not post it while it is still a draft', async () => {
      const r = expectOk(await call('post', '/recurring', emp, { amount: 800, category_id: categoryId, description: 'ZZ Monthly software', frequency: 'monthly', next_run: today(), payment_method: 'card', project_id: projectId, context_type: 'project' }), 201, 'create recurring');
      recurringId = r.id;
      expectOk(await call('post', '/recurring/run-check', admin, {}), 201, 'run check');
      expect(await prisma.transaction.count({ where: { recurringTransactionId: recurringId } })).toBe(0);
    });

    it('takes a recurring expense through manager then finance approval before it posts', async () => {
      expectOk(await call('post', `/recurring/${recurringId}/submit`, emp, {}), 201, 'submit recurring');
      expectOk(await call('post', `/recurring/${recurringId}/approve`, mgr, {}), 201, 'manager approve recurring');
      expect((await prisma.recurringTransaction.findUniqueOrThrow({ where: { id: recurringId } })).status).toBe('PENDING_FINANCE');
      expect(await prisma.approvalRequest.count({ where: { recurringTransactionId: recurringId, status: 'PENDING' } })).toBe(1);
      expectOk(await call('post', `/recurring/${recurringId}/approve`, fin, {}), 201, 'finance approve recurring');
      expect((await prisma.recurringTransaction.findUniqueOrThrow({ where: { id: recurringId } })).status).toBe('APPROVED');
      expect(await prisma.approvalRequest.count({ where: { recurringTransactionId: recurringId, status: 'PENDING' } })).toBe(0);
    });

    it('posts an approved schedule when due, as an approved expense on the project', async () => {
      expectOk(await call('post', '/recurring/run-check', admin, {}), 201, 'run check after approval');
      const made = await prisma.transaction.findFirst({ where: { recurringTransactionId: recurringId } });
      expect(made).not.toBeNull();
      expect(made!.description).toBe('[AUTO] ZZ Monthly software');
      expect(made!.status).toBe('APPROVED');
      expect(made!.projectId).toBe(projectId);
    });
  });

  describe('Reports and analytics agree with the records', () => {
    const day = today();
    const dayStart = new Date(`${day}T00:00:00.000Z`);
    const dayEnd = new Date(`${day}T23:59:59.999Z`);
    const range = `dateFrom=${day}&dateTo=${day}`;
    // Totals straight from the database for this project and day, for the given statuses
    const dbTotal = async (type: 'expense' | 'income', statuses: string[]) => {
      const rows = await prisma.transaction.findMany({
        where: { projectId, type, status: { in: statuses as any }, dateRecorded: { gte: dayStart, lte: dayEnd } },
        select: { totalAmount: true, amount: true },
      });
      return { count: rows.length, total: Math.round(rows.reduce((s, r) => s + Number(r.totalAmount ?? r.amount), 0) * 100) / 100 };
    };

    it('expense summary counts only approved expenses: the claim and the recurring run, not sent-back, rejected, voided or pending', async () => {
      const db = await dbTotal('expense', ['APPROVED']);
      expect(db).toEqual({ count: 2, total: 2300 });
      const r = expectOk(await call('get', `/reporting/generate?type=expense-summary&${range}&projectId=${projectId}`, admin), 200, 'expense summary');
      expect(r.totals['Total Amount']).toBe(db.total);
      expect(r.rows.reduce((s: number, x: any) => s + x.Transactions, 0)).toBe(db.count);
    });

    it('income summary equals approved income on the project', async () => {
      const db = await dbTotal('income', ['APPROVED']);
      expect(db).toEqual({ count: 1, total: 25000 });
      const r = expectOk(await call('get', `/reporting/generate?type=income-summary&${range}&projectId=${projectId}`, admin), 200, 'income summary');
      expect(r.totals['Total Amount']).toBe(db.total);
    });

    it('P&L for the month shows the approved income, expenses and net', async () => {
      const r = expectOk(await call('get', `/reporting/generate?type=pl-statement&${range}&projectId=${projectId}`, admin), 200, 'P&L');
      const row = r.rows.find((x: any) => x.Month === day.slice(0, 7));
      expect(row).toBeDefined();
      expect(row.Income).toBe(25000);
      expect(row.Expenses).toBe(2300);
      expect(row.Net).toBe(22700);
    });

    it('project burn on the dashboard counts approved and in-flight expenses (committed), so it includes the pending claim', async () => {
      const committed = await dbTotal('expense', ['APPROVED', 'PENDING_MANAGER', 'PENDING_FINANCE']);
      const burn = expectOk(await call('get', `/dashboard/analytics/project-burn?${range}`, admin), 200, 'project burn');
      const row = burn.find((x: any) => x.project_id === projectId);
      expect(row).toBeDefined();
      expect(row.spent).toBe(committed.total);
      // The budget is the approved baseline's direct cost: 10 hours at 1000
      const base = await prisma.estimateBaseline.findFirstOrThrow({ where: { projectId, status: 'APPROVED' }, orderBy: { id: 'desc' } });
      expect(Number(base.direct)).toBe(10000);
      expect(row.budget).toBeCloseTo(10000, 2);
    });

    it('every report type answers for admin without an error', async () => {
      const types = ['budget-by-month', 'budget-vs-actual', 'claimable-gst', 'client-po-status', 'client-statement', 'client-summary', 'collections', 'expense-summary', 'gst-position', 'gst-sales-register', 'income-summary', 'invoice-register', 'order-costing', 'outstanding-reimbursements', 'pl-statement', 'product-margin', 'project-billing', 'project-estimate', 'receivables-ageing', 'reimbursement-register', 'tds-register', 'transaction-ledger', 'unbudgeted-spend'];
      const failed: string[] = [];
      for (const t of types) {
        const r = await call('get', `/reporting/generate?type=${t}&${range}&year=${new Date().getFullYear()}&clientId=${clientId}`, admin);
        if (r.status !== 200 || !Array.isArray(r.body?.data?.columns) || !Array.isArray(r.body?.data?.rows)) failed.push(`${t}: ${r.status} ${JSON.stringify(r.body?.error ?? '').slice(0, 200)}`);
      }
      expect(failed).toEqual([]);
    });
  });

  describe('Over budget spend', () => {
    it('refuses a submission over the budget line until a reason is given, then sends it on', async () => {
      // Admin has no personal spend limit, so the budget line is what stops this one
      const id = expectOk(await call('post', '/transactions', admin, { type: 'expense', amount: 600000, dateRecorded: today(), description: 'ZZ Big purchase', paymentMethod: 'bank', categoryId, contextType: 'project', projectId }), 201, 'create big expense').id;
      const refused = await call('post', `/transactions/${id}/submit`, admin, {});
      expect(refused.status).toBe(400);
      expect(refused.body?.error?.message ?? refused.body?.message).toMatch(/over budget/);
      expectOk(await call('put', `/transactions/${id}`, admin, { overBudgetReason: 'Urgent client site repair' }), 200, 'add reason');
      expectOk(await call('post', `/transactions/${id}/submit`, admin, {}), 201, 'submit with reason');
      expect((await prisma.transaction.findUniqueOrThrow({ where: { id } })).overBudgetReason).toBe('Urgent client site repair');
      // Admin has no manager level, so the claim goes straight to Finance
      expect((await prisma.transaction.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING_FINANCE');
    });
  });

  describe('Approvals queue', () => {
    it('lists pending items for the manager and finance without leaking approved ones', async () => {
      const pending = await call('get', '/approvals/pending', mgr, undefined);
      expect(pending.status).toBe(200);
      const rows = JSON.stringify(pending.body?.data ?? []);
      expect(rows).not.toContain('ZZ Travel to site');
    });
  });
});
