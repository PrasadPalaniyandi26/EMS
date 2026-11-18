import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// The reports agree with each other, follow one data scope, and carry the columns Finance asked for.
// Test data starts with "ZZ" and is dated in 2018 where a date matters; it is removed before and after the run.
// Every delete is keyed on a list of ZZ ids, never on a single id that could be undefined.
describe('Reports phase 2 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string; let manager: string; let employee: string;
  let ids: { admin: number; mgr1: number; emp1: number; emp3: number };
  let clientId: number; let catA: number; let catB: number; let fy: number;

  const login = async (username: string, password: string) => {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password });
    if (!r.body?.data?.accessToken) throw new Error(`Login failed for ${username}`);
    return r.body.data.accessToken as string;
  };
  const report = (t: string, type: string, q = '') => request(app.getHttpServer()).get(`/api/v1/reporting/generate?type=${type}${q}`).set('Authorization', `Bearer ${t}`);
  const MAY = '&dateFrom=2018-05-01&dateTo=2018-05-31';

  const cleanup = async () => {
    const products = (await prisma.product.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((p) => p.id);
    const projects = (await prisma.project.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((p) => p.id);
    const clients = (await prisma.client.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((c) => c.id);
    await prisma.transaction.deleteMany({ where: { description: { startsWith: 'ZZ ' } } });
    if (clients.length) await prisma.invoice.deleteMany({ where: { clientId: { in: clients } } });
    if (products.length) {
      await prisma.buildOrder.deleteMany({ where: { productId: { in: products } } });
      await prisma.productPrice.deleteMany({ where: { productId: { in: products } } });
      await prisma.standardCost.deleteMany({ where: { productId: { in: products } } });
      await prisma.productionPlan.deleteMany({ where: { productId: { in: products } } });
      await prisma.bom.deleteMany({ where: { productId: { in: products } } });
      await prisma.product.deleteMany({ where: { id: { in: products } } });
    }
    if (projects.length) {
      await prisma.estimateBaseline.deleteMany({ where: { projectId: { in: projects } } });
      await prisma.project.deleteMany({ where: { id: { in: projects } } });
    }
    if (clients.length) await prisma.client.deleteMany({ where: { id: { in: clients } } });
  };

  const txn = (userId: number, description: string, amount: number, extra: Record<string, unknown> = {}) => prisma.transaction.create({
    data: { userId, type: 'expense', categoryId: catA, status: 'APPROVED', contextType: 'project', description, amount, netAmount: amount, totalAmount: amount, dateRecorded: new Date('2018-05-10'), ...extra } as any,
  });

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
    admin = await login('admin', 'admin123'); manager = await login('mgr1', 'Test@1234'); employee = await login('emp1', 'Test@1234');
    const id = async (username: string) => (await prisma.user.findFirstOrThrow({ where: { username } })).id;
    ids = { admin: await id('admin'), mgr1: await id('mgr1'), emp1: await id('emp1'), emp3: await id('emp3') };
    const cats = await prisma.category.findMany({ where: { isActive: true, type: 'expense' }, orderBy: { id: 'asc' }, take: 2 });
    catA = cats[0].id; catB = cats[1].id;
    clientId = (await prisma.client.create({ data: { name: 'ZZ Phase2 client' } })).id;
    fy = (await request(app.getHttpServer()).get('/api/v1/budgets/fiscal-year').set('Authorization', `Bearer ${admin}`)).body.data.current_fy;
  }, 60000);

  afterAll(async () => { await cleanup(); await app.close(); });

  describe('reconciliation', () => {
    beforeAll(async () => {
      // Approved: a claimable expense with 18% GST, a split expense, income; waiting and draft expenses that the summaries must not count
      await txn(ids.admin, 'ZZ approved with GST', 1180, { netAmount: 1000, gstRate: 18, isClaimable: true, clientId });
      const split = await txn(ids.admin, 'ZZ approved split', 600, { isSplit: true });
      await prisma.transactionSplit.create({ data: { transactionId: split.id, categoryId: catA, amount: 400 } });
      await prisma.transactionSplit.create({ data: { transactionId: split.id, categoryId: catB, amount: 200 } });
      await txn(ids.admin, 'ZZ approved income', 500, { type: 'income', clientId });
      await txn(ids.admin, 'ZZ waiting', 300, { status: 'PENDING_FINANCE' });
      await txn(ids.admin, 'ZZ draft', 200, { status: 'DRAFT' });
    });

    it('agrees across the Expense Summary, P&L, Client Summary and the approved ledger', async () => {
      const summary = (await report(admin, 'expense-summary', MAY)).body.data;
      const pl = (await report(admin, 'pl-statement', MAY)).body.data;
      const clients = (await report(admin, 'client-summary', `${MAY}&txnType=expense`)).body.data;
      const ledger = (await report(admin, 'transaction-ledger', `${MAY}&txnType=expense&status=approved`)).body.data;
      const approvedTotal = 1180 + 600;
      expect(summary.totals['Total Amount']).toBe(approvedTotal);
      expect(pl.totals.Expenses).toBe(approvedTotal);
      expect(clients.totals.Amount).toBe(approvedTotal);
      expect(ledger.rows.reduce((a: number, r: any) => a + r['Total Amount'], 0)).toBeCloseTo(approvedTotal, 2);
    });

    it('shows GST, share and claimable GST on the summaries, and never merges categories', async () => {
      const d = (await report(admin, 'expense-summary', MAY)).body.data;
      expect(d.columns).toEqual(['Category', 'Transactions', 'Net Amount', 'GST Amount', 'Total Amount', 'Average', 'Share %', 'Claimable GST']);
      expect(d.totals['GST Amount']).toBe(180);
      expect(d.totals['Claimable GST']).toBe(180);
      expect(d.totals['Share %']).toBe(100);
      expect(d.rows.reduce((a: number, r: any) => a + r['Share %'], 0)).toBeCloseTo(100, 1);
      // The split expense is counted under both categories it was split into
      expect(d.rows.length).toBeGreaterThanOrEqual(2);
      const income = (await report(admin, 'income-summary', MAY)).body.data;
      expect(income.columns).not.toContain('Claimable GST');
      expect(income.totals['Total Amount']).toBe(500);
    });

    it('weights the Claimable GST rate by value', async () => {
      const d = (await report(admin, 'claimable-gst', MAY)).body.data;
      expect(d.totals['Effective GST %']).toBe(18);
      expect(d.columns).toContain('Effective GST %');
      expect(d.columns).not.toContain('Avg GST %');
    });

    it('fills the months with no records in the P&L', async () => {
      const d = (await report(admin, 'pl-statement', '&dateFrom=2018-05-01&dateTo=2018-08-31')).body.data;
      expect(d.rows.map((r: any) => r.Month)).toEqual(['2018-05', '2018-06', '2018-07', '2018-08']);
      expect(d.rows[1]).toMatchObject({ Income: 0, Expenses: 0, Net: 0 });
      expect(d.rows[0].Net).toBe(500 - 1780);
    });

    it('lists the ledger with the system reference, no "Source", a row for each split part and a status breakdown', async () => {
      const d = (await report(admin, 'transaction-ledger', MAY)).body.data;
      expect(d.columns).not.toContain('Source');
      expect(d.columns).toEqual(expect.arrayContaining(['Reference', 'Employee', 'Approved By', 'Split', 'Type']));
      const parts = d.rows.filter((r: any) => r.Description === 'ZZ approved split');
      expect(parts.map((r: any) => r.Split)).toEqual(['1 of 2', '2 of 2']);
      expect(parts.map((r: any) => r['Total Amount']).sort()).toEqual([200, 400]);
      expect(d.rows.find((r: any) => r.Description === 'ZZ approved with GST').Reference).toMatch(/^(#\d+|[A-Z]+-\d+)$/);
      expect(d.note).toMatch(/Approved: income 500\.00, expense 1,780\.00/);
      expect(d.note).toMatch(/Waiting for approval: expense 300\.00/);
      expect(d.note).toMatch(/Draft: expense 200\.00/);
      // A type filter drops the Type column, and a status filter narrows the rows
      expect((await report(admin, 'transaction-ledger', `${MAY}&txnType=expense`)).body.data.columns).not.toContain('Type');
      const waiting = (await report(admin, 'transaction-ledger', `${MAY}&status=waiting`)).body.data;
      expect(waiting.rows.map((r: any) => r.Description)).toEqual(['ZZ waiting']);
      // Another person's draft stays private
      const emp = (await report(employee, 'transaction-ledger', MAY)).body.data;
      expect(emp.rows.some((r: any) => r.Description === 'ZZ draft')).toBe(false);
    });
  });

  describe('data scope', () => {
    it('shows a manager their own and their team\'s records, not another team\'s', async () => {
      await txn(ids.mgr1, 'ZZ scope manager', 11, { dateRecorded: new Date('2018-06-05') });
      await txn(ids.emp1, 'ZZ scope own team', 22, { dateRecorded: new Date('2018-06-06') });
      await txn(ids.emp3, 'ZZ scope other team', 33, { dateRecorded: new Date('2018-06-07') });
      const june = '&dateFrom=2018-06-01&dateTo=2018-06-30';
      const names = (d: any) => d.rows.map((r: any) => r.Description).filter((x: string) => x.startsWith('ZZ scope')).sort();
      expect(names((await report(admin, 'transaction-ledger', june)).body.data)).toEqual(['ZZ scope manager', 'ZZ scope other team', 'ZZ scope own team']);
      expect(names((await report(manager, 'transaction-ledger', june)).body.data)).toEqual(['ZZ scope manager', 'ZZ scope own team']);
      expect(names((await report(employee, 'transaction-ledger', june)).body.data)).toEqual(['ZZ scope own team']);
      expect((await report(manager, 'expense-summary', june)).body.data.totals['Total Amount']).toBe(33);
    });
  });

  describe('orders', () => {
    it('adds dates, days late, invoiced and received, and an overall margin', async () => {
      const product = await prisma.product.create({ data: { clientId, name: 'ZZ Phase2 product' } });
      const make = (code: string, extra: Record<string, unknown>) => prisma.buildOrder.create({
        data: { code, productId: product.id, clientId, quantity: 2, unitCost: 100, unitPrice: 150, startDate: new Date('2018-05-01'), deliveryDate: new Date('2018-06-30'), ...extra } as any,
      });
      const late = await make('ZZ-P2-1', { status: 'DELIVERED', deliveredOn: new Date('2018-07-05') });
      await make('ZZ-P2-2', { status: 'DELIVERED', deliveredOn: new Date('2018-06-28') });
      await make('ZZ-P2-3', { status: 'COMMITTED', deliveryDate: new Date('2018-01-01'), startDate: new Date('2017-12-01') });
      const base = { clientId, taxable: 0, cgst: 0, sgst: 0, igst: 0, roundOff: 0, invoiceDate: new Date('2018-07-06'), dueDate: new Date('2018-08-06') };
      await prisma.invoice.create({ data: { ...base, buildOrderId: late.id, taxable: 300, total: 300, paid: 200, tds: 30, status: 'PART_PAID' } });
      await prisma.invoice.create({ data: { ...base, buildOrderId: late.id, taxable: 999, total: 999, status: 'DRAFT' } });
      const d = (await report(admin, 'order-costing', '&dateFrom=2017-12-01&dateTo=2018-12-31')).body.data;
      const row = (code: string) => d.rows.find((r: any) => r.Order === code);
      expect(d.columns).toEqual(expect.arrayContaining(['Start', 'Promised', 'Delivered', 'Days Late', 'Invoiced', 'Received']));
      expect(row('ZZ-P2-1')).toMatchObject({ Start: '2018-05-01', Promised: '2018-06-30', Delivered: '2018-07-05', 'Days Late': 4, Invoiced: 300, Received: 230 });
      expect(row('ZZ-P2-2')['Days Late']).toBeNull();
      expect(row('ZZ-P2-3')['Days Late']).toBeGreaterThan(300);
      expect(row('ZZ-P2-2')['Planned Margin %']).toBeCloseTo(33.33, 2);
      expect(d.totals['Planned Margin %']).toBeCloseTo(33.33, 2);
      expect(d.totals.Invoiced).toBe(300);
    });
  });

  describe('products', () => {
    it('lists every product, and says what is missing instead of leaving it out', async () => {
      const make = (name: string) => prisma.product.create({ data: { clientId, name } });
      const full = await make('ZZ Phase2 priced'); const noPrice = await make('ZZ Phase2 no price'); const noGoals = await make('ZZ Phase2 no goals'); const low = await make('ZZ Phase2 low');
      for (const p of [full, noGoals, low]) {
        const bom = await prisma.bom.create({ data: { productId: p.id, version: 1 } });
        await prisma.standardCost.create({ data: { productId: p.id, bomId: bom.id, fy, material: 80, scrap: 0, freight: 0, conversion: 0, overhead: 0, warranty: 0, total: 80, status: 'APPROVED' } });
      }
      await prisma.productPrice.create({ data: { productId: full.id, fy, price: 100, targetMarginPct: 10, minMarginPct: 5 } });
      await prisma.productPrice.create({ data: { productId: noGoals.id, fy, price: 100 } });
      await prisma.productPrice.create({ data: { productId: low.id, fy, price: 100, targetMarginPct: 40, minMarginPct: 30 } });
      const settings = (await request(app.getHttpServer()).get('/api/v1/budgets/plans').set('Authorization', `Bearer ${admin}`)).body.data;
      expect(settings.current_fy).toBe(fy);
      const first = (await request(app.getHttpServer()).get(`/api/v1/budgets/plans/${fy}`).set('Authorization', `Bearer ${admin}`)).body.data.months[0];
      await prisma.productionPlan.create({ data: { productId: full.id, year: first.year, month: first.month, plannedUnits: 10 } });
      const d = (await report(admin, 'product-margin')).body.data;
      const row = (name: string) => d.rows.find((r: any) => r.Product === name);
      expect(row('ZZ Phase2 priced')).toMatchObject({ Price: 100, 'Standard Cost': 80, Margin: 20, 'Margin %': 20, Position: 'On target', 'Planned Units': 10, 'Extended Margin': 200 });
      expect(row('ZZ Phase2 no price')).toMatchObject({ Price: null, Position: 'No price set' });
      expect(row('ZZ Phase2 no goals').Position).toBe('No goals set');
      expect(row('ZZ Phase2 low').Position).toBe('Below minimum');
      expect(row('ZZ Phase2 priced')['Cost Year']).toMatch(/FY/);
      // Products that need attention come before the ones that are fine
      const order = d.rows.map((r: any) => r.Position);
      expect(order.indexOf('Below minimum')).toBeLessThan(order.lastIndexOf('On target'));
      expect(d.totals['Extended Margin']).toBeGreaterThanOrEqual(200);
    });
  });

  describe('projects', () => {
    it('measures against the baseline, with estimate total, invoiced and received', async () => {
      const project = await prisma.project.create({ data: { clientId, name: 'ZZ Phase2 project', contractValue: 1000 } });
      await prisma.estimateBaseline.create({ data: { projectId: project.id, status: 'APPROVED', direct: 500, contingency: 50, warranty: 10, total: 560, contingencyPct: 10, warrantyPct: 2, lines: [] } });
      await txn(ids.admin, 'ZZ project spend', 125, { projectId: project.id, dateRecorded: new Date('2018-05-20') });
      await prisma.invoice.create({ data: { clientId, projectId: project.id, invoiceDate: new Date('2018-06-01'), dueDate: new Date('2018-07-01'), taxable: 400, total: 472, paid: 100, tds: 20, status: 'PART_PAID' } });
      const d = (await report(admin, 'project-estimate')).body.data;
      const row = d.rows.find((r: any) => r.Project === 'ZZ Phase2 project');
      expect(row).toMatchObject({ 'Contract Value': 1000, Estimate: 500, 'Estimate Total': 560, Spent: 125, Remaining: 375, '% Used': 25, Invoiced: 400, Received: 120, 'Planned Margin %': 44 });
      expect(d.columns).toEqual(expect.arrayContaining(['Estimate Total', 'Invoiced', 'Received']));
    });
  });

  describe('unbudgeted spend', () => {
    it('shows the order an expense was charged to', async () => {
      const product = await prisma.product.create({ data: { clientId, name: 'ZZ Phase2 order product' } });
      const order = await prisma.buildOrder.create({ data: { code: 'ZZ-P2-U', productId: product.id, clientId, quantity: 1, startDate: new Date('2018-05-01'), deliveryDate: new Date('2018-06-01') } });
      // Dated today, so it falls in the current plan year
      await txn(ids.admin, 'ZZ unbudgeted order spend', 77, { contextType: 'product', productId: product.id, buildOrderId: order.id, dateRecorded: new Date() });
      const d = (await report(admin, 'unbudgeted-spend')).body.data;
      expect(d.columns).toContain('Order');
      expect(d.rows.find((r: any) => r.Order === 'ZZ-P2-U')).toMatchObject({ Amount: 77, 'Charged To': 'Product' });
    });
  });
});
