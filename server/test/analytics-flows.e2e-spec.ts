import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// Reports and Spend Analytics: bad input is a 400, the figures add up, a split expense is counted under the
// categories it was split into, drafts stay private, and Home agrees with Approvals.
// Test data is dated in 2018 and starts with "ZZ " in the description; it is removed before and after the run.
describe('Reports and analytics (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string;
  let finance: string;
  let employee: string;
  let catA: { id: number; name: string };
  let catB: { id: number; name: string };
  let adminId: number;
  let empId: number;

  const login = async (username: string, password: string) => {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password });
    if (!r.body?.data?.accessToken) throw new Error(`Login failed for ${username}`);
    return r.body.data.accessToken as string;
  };
  const get = (token: string, url: string) => request(app.getHttpServer()).get(`/api/v1${url}`).set('Authorization', `Bearer ${token}`);
  const report = (token: string, type: string, extra = '') => get(token, `/reporting/generate?type=${type}${extra}`);
  const window2018 = '&dateFrom=2018-05-01&dateTo=2018-05-31';

  const cleanup = async () => {
    await prisma.transactionSplit.deleteMany({ where: { transaction: { description: { startsWith: 'ZZ ' } } } });
    await prisma.transaction.deleteMany({ where: { description: { startsWith: 'ZZ ' } } });
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
    finance = await login('fin1', 'Test@1234');
    employee = await login('emp1', 'Test@1234');
    const cats = await prisma.category.findMany({ where: { isActive: true, type: 'expense' }, take: 2, orderBy: { id: 'asc' } });
    catA = { id: cats[0].id, name: cats[0].name };
    catB = { id: cats[1].id, name: cats[1].name };
    adminId = (await prisma.user.findFirstOrThrow({ where: { username: 'admin' } })).id;
    empId = (await prisma.user.findFirstOrThrow({ where: { username: 'emp1' } })).id;
  }, 60000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('input checks', () => {
    it('refuses a date that is not a date, and a period that runs backwards', async () => {
      expect((await report(admin, 'expense-summary', '&dateFrom=banana')).status).toBe(400);
      expect((await report(admin, 'pl-statement', '&dateFrom=2026-05-31&dateTo=2026-05-01')).status).toBe(400);
      expect((await get(admin, '/dashboard/summary?dateFrom=nope')).status).toBe(400);
      expect((await get(admin, '/dashboard/analytics/category-heatmap?dateFrom=2026-02-30x')).status).toBe(400);
    });

    it('refuses a year that is not four digits', async () => {
      expect((await report(admin, 'budget-by-month', '&year=abc')).status).toBe(400);
      expect((await report(finance, 'product-margin', '&year=26')).status).toBe(400);
    });
  });

  describe('a split expense', () => {
    let txnId: number;
    beforeAll(async () => {
      const t = await prisma.transaction.create({
        data: {
          userId: adminId, type: 'expense', amount: 1000, netAmount: 1000, totalAmount: 1000, dateRecorded: new Date('2018-05-10'),
          categoryId: catA.id, description: 'ZZ split expense', status: 'APPROVED', contextType: 'project', isSplit: true,
        },
      });
      txnId = t.id;
      await prisma.transactionSplit.createMany({ data: [
        { transactionId: txnId, categoryId: catA.id, amount: 400 },
        { transactionId: txnId, categoryId: catB.id, amount: 600 },
      ] });
    });

    it('is reported under the categories it was split into', async () => {
      const r = await report(admin, 'expense-summary', window2018);
      expect(r.status).toBe(200);
      const rows = r.body.data.rows as any[];
      expect(rows.find((x) => x.Category === catA.name)['Total Amount']).toBe(400);
      expect(rows.find((x) => x.Category === catB.name)['Total Amount']).toBe(600);
      expect(r.body.data.totals['Total Amount']).toBe(1000);
      expect(rows.find((x) => x.Category === catB.name).Transactions).toBe(1);
    });

    it('is shown month by month in the heat map for the chosen period, not for the last twelve months', async () => {
      const r = await get(admin, '/dashboard/analytics/category-heatmap?dateFrom=2018-01-01&dateTo=2018-12-31');
      expect(r.status).toBe(200);
      const d = r.body.data;
      expect(d.months).toHaveLength(12);
      const may = d.months[4];
      expect(may.values[catA.name]).toBe(400);
      expect(may.values[catB.name]).toBe(600);
    });
  });

  describe('the profit and loss statement', () => {
    it('adds up: the monthly rows are the totals, with or without a period', async () => {
      for (const extra of ['', window2018]) {
        const r = await report(admin, 'pl-statement', extra);
        expect(r.status).toBe(200);
        const rows = r.body.data.rows as any[];
        const sum = (k: string) => Math.round(rows.reduce((a, x) => a + x[k], 0) * 100) / 100;
        expect(r.body.data.totals.Income).toBe(sum('Income'));
        expect(r.body.data.totals.Expenses).toBe(sum('Expenses'));
      }
    });
  });

  describe('the ledger', () => {
    it('keeps a draft private to the person who wrote it, and names where each entry is charged', async () => {
      await prisma.transaction.create({
        data: { userId: empId, type: 'expense', amount: 55, netAmount: 55, totalAmount: 55, dateRecorded: new Date('2018-05-12'), categoryId: catA.id, description: 'ZZ private draft', status: 'DRAFT' },
      });
      const adminView = await report(admin, 'transaction-ledger', window2018);
      expect(adminView.status).toBe(200);
      expect((adminView.body.data.rows as any[]).some((x) => x.Description === 'ZZ private draft')).toBe(false);
      expect(adminView.body.data.columns).toEqual(expect.arrayContaining(['Product', 'Department', 'Order']));
      const own = await report(employee, 'transaction-ledger', window2018);
      expect((own.body.data.rows as any[]).some((x) => x.Description === 'ZZ private draft')).toBe(true);
    });
  });

  describe('Home', () => {
    it('shows the same number of requests waiting as Approvals does', async () => {
      const counts = await get(finance, '/dashboard/approval-counts');
      const pending = await get(finance, '/approvals/pending');
      expect(counts.status).toBe(200);
      expect(counts.body.data.pendingMyAction).toBe((pending.body.data as any[]).length);
    });

    it('does not show budget lines to a role that cannot open Budget', async () => {
      const r = await get(employee, '/dashboard/budget-utilization');
      expect(r.status).toBe(200);
      expect(r.body.data).toEqual([]);
    });
  });
});
