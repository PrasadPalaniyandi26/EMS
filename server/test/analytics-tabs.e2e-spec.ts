import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// The Analytics tabs for projects, orders, people, receivables and part prices.
// Test data starts with "ZZ" and is dated in 2018 where a date matters; it is removed before and after the run.
// Every delete below is keyed on a list of ZZ ids, never on a single id that could be undefined.
describe('Analytics tabs (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string; let manager: string; let employee: string;
  let adminId: number; let clientId: number;

  const login = async (username: string, password: string) => {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password });
    if (!r.body?.data?.accessToken) throw new Error(`Login failed for ${username}`);
    return r.body.data.accessToken as string;
  };
  const get = (t: string, path: string) => request(app.getHttpServer()).get(`/api/v1/dashboard/analytics/${path}`).set('Authorization', `Bearer ${t}`);
  const send = (method: 'post' | 'put' | 'get', t: string, url: string, body: object) => (request(app.getHttpServer()) as any)[method](`/api/v1${url}`).set('Authorization', `Bearer ${t}`).send(body);
  const day = (offset: number) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + offset); return d; };

  const cleanup = async () => {
    const clients = (await prisma.client.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((c) => c.id);
    const projects = (await prisma.project.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((p) => p.id);
    await prisma.transaction.deleteMany({ where: { description: { startsWith: 'ZZ ' } } });
    if (clients.length) {
      await prisma.invoicePayment.deleteMany({ where: { invoice: { clientId: { in: clients } } } });
      await prisma.invoice.deleteMany({ where: { clientId: { in: clients } } });
      await prisma.buildOrder.deleteMany({ where: { clientId: { in: clients } } });
    }
    if (projects.length) {
      await prisma.estimateLine.deleteMany({ where: { estimate: { projectId: { in: projects } } } });
      await prisma.costEstimate.deleteMany({ where: { projectId: { in: projects } } });
      await prisma.projectPriceChange.deleteMany({ where: { projectId: { in: projects } } });
      await prisma.project.deleteMany({ where: { id: { in: projects } } });
    }
    if (clients.length) await prisma.client.deleteMany({ where: { id: { in: clients } } });
    await prisma.item.deleteMany({ where: { partNo: { startsWith: 'ZZ-AN' } } });
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
    manager = await login('mgr1', 'Test@1234');
    employee = await login('emp1', 'Test@1234');
    adminId = (await prisma.user.findFirstOrThrow({ where: { username: 'admin' } })).id;
    clientId = (await prisma.client.create({ data: { name: 'ZZ Analytics client' } })).id;
  }, 60000);

  afterAll(async () => { await cleanup(); await app.close(); });

  it('is closed to employees and open to a manager', async () => {
    for (const path of ['project-profitability', 'order-delivery', 'spending-by-person', 'receivables', 'part-prices']) {
      expect((await get(employee, path)).status).toBe(403);
      expect((await get(manager, path)).status).toBe(200);
    }
  });

  it('refuses a bad period', async () => {
    expect((await get(admin, 'spending-by-person?dateFrom=nope')).status).toBe(400);
    expect((await get(admin, 'part-prices?dateFrom=2018-06-01&dateTo=2018-01-01')).status).toBe(400);
  });

  describe('projects', () => {
    it('works out margin from the contract value and the estimate, and judges it against the goals', async () => {
      const project = await prisma.project.create({ data: { clientId, name: 'ZZ Margin project' } });
      expect((await send('post', admin, `/budgets/projects/${project.id}/estimate-lines`, { phase: 'Design', description: 'ZZ work', quantity: 1, rate: 500000, unit: 'nos' })).status).toBe(201);
      expect((await send('put', admin, `/budgets/projects/${project.id}/settings`, { contract_value: 1000000, target_margin_pct: 60, min_margin_pct: 40, contingency_pct: 0, warranty_pct: 0 })).status).toBe(200);
      const d = (await get(admin, 'project-profitability')).body.data;
      const row = d.rows.find((r: any) => r.id === project.id);
      expect(row).toMatchObject({ contract_value: 1000000, estimate_total: 500000, profit: 500000, margin_pct: 50, state: 'Below target' });
      // A minimum above the target is refused; raise both and the same margin is now below the minimum
      expect((await send('put', admin, `/budgets/projects/${project.id}/settings`, { min_margin_pct: 70 })).status).toBe(400);
      await send('put', admin, `/budgets/projects/${project.id}/settings`, { target_margin_pct: 90, min_margin_pct: 60 });
      expect((await get(admin, 'project-profitability')).body.data.rows.find((r: any) => r.id === project.id).state).toBe('Below minimum');
      expect(d.totals.priced).toBeGreaterThanOrEqual(1);
      // Lowest margin first, projects with no figure last
      const margins = d.rows.map((r: any) => r.margin_pct);
      const known = margins.filter((m: number | null) => m != null);
      expect(known).toEqual([...known].sort((a: number, b: number) => a - b));
      expect(margins.slice(known.length).every((m: number | null) => m == null)).toBe(true);
    });
  });

  describe('a project with a price but no estimate', () => {
    it('shows no margin, because there is no cost to take from the price', async () => {
      const project = await prisma.project.create({ data: { clientId, name: 'ZZ Unestimated project', contractValue: 250000 } });
      const row = (await get(admin, 'project-profitability')).body.data.rows.find((r: any) => r.id === project.id);
      expect(row).toMatchObject({ contract_value: 250000, estimate_total: null, margin_pct: null, state: 'No price or estimate' });
      const detail = (await send('get', admin, `/budgets/projects/${project.id}`, {})).body.data;
      expect(detail.margin.estimate_margin_pct).toBeNull();
      expect(detail.margin.projected_margin_pct).toBeNull();
    });
  });

  describe('orders', () => {
    it('counts on-time and late deliveries and lists open orders past their promised date', async () => {
      const before = (await get(admin, 'order-delivery')).body.data;
      const product = await prisma.product.findFirstOrThrow();
      const make = (code: string, extra: object) => prisma.buildOrder.create({ data: { code, productId: product.id, clientId, quantity: 1, unitPrice: 100, startDate: new Date('2018-05-01'), deliveryDate: new Date('2018-06-30'), ...extra } });
      await make('ZZ-AN-1', { status: 'DELIVERED', deliveredOn: new Date('2018-06-28') });
      await make('ZZ-AN-2', { status: 'DELIVERED', deliveredOn: new Date('2018-07-05') });
      const open = await make('ZZ-AN-3', { status: 'COMMITTED', deliveryDate: new Date('2018-01-01'), startDate: new Date('2017-12-01') });
      const d = (await get(admin, 'order-delivery')).body.data;
      expect(d.kpis.delivered - before.kpis.delivered).toBe(2);
      expect(d.kpis.on_time - before.kpis.on_time).toBe(1);
      expect(d.kpis.open - before.kpis.open).toBe(1);
      expect(d.months).toHaveLength(12);
      const risk = d.at_risk.find((r: any) => r.id === open.id);
      expect(risk.reason).toBe('Past the promised date');
      expect(risk.days).toBeGreaterThan(300);
      // The most overdue order is listed first
      const days = d.at_risk.map((r: any) => r.days);
      expect(days).toEqual([...days].sort((a: number, b: number) => b - a));
    });
  });

  describe('people', () => {
    it('splits approved and waiting spend for each person and the shares add up', async () => {
      const cat = (await prisma.category.findFirstOrThrow({ where: { isActive: true, type: 'expense' }, orderBy: { id: 'asc' } })).id;
      const range = '?dateFrom=2018-05-01&dateTo=2018-05-31';
      const before = (await get(admin, `spending-by-person${range}`)).body.data;
      const make = (amount: number, status: string) => prisma.transaction.create({ data: { userId: adminId, type: 'expense', amount, netAmount: amount, totalAmount: amount, dateRecorded: new Date('2018-05-12'), categoryId: cat, description: 'ZZ analytics spend', status, contextType: 'project' } });
      await make(1200, 'APPROVED');
      await make(300, 'PENDING_FINANCE');
      const d = (await get(admin, `spending-by-person${range}`)).body.data;
      const me = d.people.find((p: any) => p.user_id === adminId);
      const was = before.people.find((p: any) => p.user_id === adminId);
      expect(me.approved - (was?.approved ?? 0)).toBeCloseTo(1200, 2);
      expect(me.waiting - (was?.waiting ?? 0)).toBeCloseTo(300, 2);
      expect(me.total).toBeCloseTo(me.approved + me.waiting, 2);
      expect(d.totals.total - before.totals.total).toBeCloseTo(1500, 2);
      const share = d.people.reduce((a: number, p: any) => a + p.share_pct, 0);
      expect(share).toBeGreaterThan(99);
      expect(share).toBeLessThan(101);
      const deptTotal = d.departments.reduce((a: number, x: any) => a + x.total, 0);
      expect(deptTotal).toBeCloseTo(d.totals.total, 1);
    });
  });

  describe('receivables', () => {
    it('buckets what is owed by how late it is, leaving out drafts and cancelled invoices', async () => {
      const before = (await get(admin, 'receivables')).body.data;
      const base = { clientId, taxable: 0, cgst: 0, sgst: 0, igst: 0, roundOff: 0 };
      await prisma.invoice.create({ data: { ...base, invoiceDate: day(-60), dueDate: day(-45), total: 10000, paid: 0, status: 'ISSUED' } });
      await prisma.invoice.create({ data: { ...base, invoiceDate: day(-5), dueDate: day(10), total: 5000, paid: 1000, status: 'PART_PAID' } });
      await prisma.invoice.create({ data: { ...base, invoiceDate: day(-5), dueDate: day(-100), total: 9999, status: 'DRAFT' } });
      await prisma.invoice.create({ data: { ...base, invoiceDate: day(-5), dueDate: day(-100), total: 8888, status: 'CANCELLED' } });
      const d = (await get(admin, 'receivables')).body.data;
      const bucket = (x: any, label: string) => x.buckets.find((b: any) => b.label === label).amount;
      expect(bucket(d, '31-60 Days') - bucket(before, '31-60 Days')).toBeCloseTo(10000, 2);
      expect(bucket(d, 'Not Due') - bucket(before, 'Not Due')).toBeCloseTo(4000, 2);
      expect(bucket(d, 'Over 90 Days') - bucket(before, 'Over 90 Days')).toBeCloseTo(0, 2);
      expect(d.outstanding - before.outstanding).toBeCloseTo(14000, 2);
      expect(d.overdue).toBeCloseTo(d.outstanding - bucket(d, 'Not Due'), 2);
      expect(d.buckets.reduce((a: number, b: any) => a + b.amount, 0)).toBeCloseTo(d.outstanding, 2);
      expect(d.monthly).toHaveLength(12);
      const billed = (x: any) => x.monthly.reduce((a: number, m: any) => a + m.billed, 0);
      expect(billed(d) - billed(before)).toBeCloseTo(15000, 2);
    });
  });

  describe('part prices', () => {
    it('shows how a part price moved between the first and the latest purchase', async () => {
      const item = await prisma.item.create({ data: { partNo: 'ZZ-AN1', name: 'ZZ Analytics part', standardPrice: 100, uom: 'nos' } });
      for (const [date, price] of [['2018-03-01', 100], ['2018-04-01', 120], ['2018-05-01', 130]] as const) {
        await prisma.itemPriceLog.create({ data: { itemId: item.id, price, paidOn: new Date(date), supplier: 'ZZ Supplier' } });
      }
      const d = (await get(admin, 'part-prices?dateFrom=2018-01-01&dateTo=2018-12-31')).body.data;
      const row = d.rows.find((r: any) => r.item_id === item.id);
      expect(row).toMatchObject({ part_no: 'ZZ-AN1', purchases: 3, first_price: 100, latest_price: 130, change_pct: 30, vs_standard_pct: 30 });
      expect(row.series.map((s: any) => s.price)).toEqual([100, 120, 130]);
      expect(d.totals.up).toBeGreaterThanOrEqual(1);
      // A period before the purchases shows nothing for the part
      const none = (await get(admin, 'part-prices?dateFrom=2017-01-01&dateTo=2017-12-31')).body.data;
      expect(none.rows.find((r: any) => r.item_id === item.id)).toBeUndefined();
    });
  });
});
