import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// Fixes to the Client Summary, the Reimbursement Register and the Budget vs Actual totals, and the open fiscal-year endpoint.
// Test data starts with "ZZ" and is dated in 2018; it is removed before and after the run.
describe('Report fixes (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string; let employee: string;
  let adminId: number; let clientId: number; let departmentId: number; let categoryId: number;

  const login = async (username: string, password: string) => {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password });
    if (!r.body?.data?.accessToken) throw new Error(`Login failed for ${username}`);
    return r.body.data.accessToken as string;
  };
  const get = (t: string, url: string) => request(app.getHttpServer()).get(`/api/v1${url}`).set('Authorization', `Bearer ${t}`);
  const report = (type: string, q = '') => get(admin, `/reporting/generate?type=${type}${q}`);
  const MAY = '&dateFrom=2018-05-01&dateTo=2018-05-31';

  const cleanup = async () => {
    await prisma.transaction.deleteMany({ where: { description: { startsWith: 'ZZ ' } } });
    const clients = (await prisma.client.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((c) => c.id);
    if (clients.length) await prisma.client.deleteMany({ where: { id: { in: clients } } });
    const depts = (await prisma.department.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((d) => d.id);
    if (depts.length) await prisma.department.deleteMany({ where: { id: { in: depts } } });
  };

  const txn = (data: Record<string, unknown>) => prisma.transaction.create({
    data: { userId: adminId, type: 'expense', categoryId, status: 'APPROVED', contextType: 'project', ...data } as any,
  });
  const money = (description: string, amount: number, extra: Record<string, unknown> = {}) => ({ description, amount, netAmount: amount, totalAmount: amount, ...extra });

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
    employee = await login('emp1', 'Test@1234');
    adminId = (await prisma.user.findFirstOrThrow({ where: { username: 'admin' } })).id;
    categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true, type: 'expense' }, orderBy: { id: 'asc' } })).id;
    clientId = (await prisma.client.create({ data: { name: 'ZZ Reports client' } })).id;
    departmentId = (await prisma.department.create({ data: { name: 'ZZ Reports department' } })).id;
  }, 60000);

  afterAll(async () => { await cleanup(); await app.close(); });

  describe('Client Summary', () => {
    beforeAll(async () => {
      await txn({ ...money('ZZ with a client', 1000, { dateRecorded: new Date('2018-05-10'), clientId }) });
      await txn({ ...money('ZZ overhead, no client', 400, { dateRecorded: new Date('2018-05-11'), contextType: 'overhead', departmentId }) });
      await txn({ ...money('ZZ income', 2500, { dateRecorded: new Date('2018-05-12'), type: 'income', clientId }) });
    });

    it('lists spend with no client under "No client" instead of dropping it, so it ties to the Expense Summary', async () => {
      const d = (await report('client-summary', `${MAY}&txnType=expense`)).body.data;
      expect(d.columns).toEqual(['Client', 'Category', 'Transactions', 'Amount']);
      expect(d.rows.find((r: any) => r.Client === 'No client').Amount).toBe(400);
      expect(d.rows.find((r: any) => r.Client === 'ZZ Reports client').Amount).toBe(1000);
      expect(d.totals.Amount).toBe(1400);
      const summary = (await report('expense-summary', MAY)).body.data;
      expect(d.totals.Amount).toBe(summary.totals['Total Amount']);
    });

    it('keeps income and expense apart when no type is chosen, with no single total across them', async () => {
      const d = (await report('client-summary', MAY)).body.data;
      expect(d.columns).toContain('Type');
      expect(d.rows.map((r: any) => r.Type).sort()).toEqual(expect.arrayContaining(['Expense', 'Income']));
      expect(d.totals).toEqual({});
      expect(d.note).toMatch(/Income 2,500\.00 and expense 1,400\.00/);
    });
  });

  describe('Reimbursement Register', () => {
    beforeAll(async () => {
      const claim = (description: string, amount: number, extra: Record<string, unknown>) => txn({ ...money(description, amount, extra), needsReimbursement: true });
      await claim('ZZ claim pending', 300, { dateRecorded: new Date('2018-05-12') });
      await claim('ZZ claim on hold', 200, { dateRecorded: new Date('2018-05-20'), reimbursementStatus: 'ON_HOLD' });
      // Paid late on the last day of the period, for an expense from the month before
      await claim('ZZ claim paid', 500, { dateRecorded: new Date('2018-04-02'), reimbursementStatus: 'PAID', reimbursedAt: new Date('2018-05-31T15:30:00Z'), reimbursedByName: 'admin' });
      // Not approved, so it is not a claim yet
      await claim('ZZ claim draft', 999, { dateRecorded: new Date('2018-05-15'), status: 'DRAFT' });
    });

    it('lists pending, on hold and paid claims, and a claim paid late on the last day stays in the period', async () => {
      const d = (await report('reimbursement-register', MAY)).body.data;
      const mine = d.rows.filter((r: any) => String(r.Description).startsWith('ZZ claim'));
      expect(mine.map((r: any) => r.Status).sort()).toEqual(['On Hold', 'Paid', 'Pending']);
      expect(mine.find((r: any) => r.Status === 'Pending').Amount).toBe(300);
      expect(mine.find((r: any) => r.Status === 'Paid')['Reimbursed On']).toBe('2018-05-31');
      expect(mine.some((r: any) => r.Description === 'ZZ claim draft')).toBe(false);
      // Open claims come first, and the total is the sum of every row listed
      const order = d.rows.map((r: any) => r.Status);
      expect(order.lastIndexOf('Pending')).toBeLessThan(order.indexOf('Paid'));
      expect(d.totals.Amount).toBeCloseTo(d.rows.reduce((a: number, r: any) => a + r.Amount, 0), 2);
      expect(d.note).toMatch(/still to pay/);
    });

    it('uses the expense date for an open claim and the paid date for a paid one', async () => {
      const april = (await report('reimbursement-register', '&dateFrom=2018-04-01&dateTo=2018-04-30')).body.data;
      expect(april.rows.some((r: any) => r.Description === 'ZZ claim paid')).toBe(false);
      const june = (await report('reimbursement-register', '&dateFrom=2018-06-01&dateTo=2018-06-30')).body.data;
      expect(june.rows.filter((r: any) => String(r.Description).startsWith('ZZ claim'))).toHaveLength(0);
    });
  });

  describe('Budget vs Actual', () => {
    it('has totals that add up the rows shown, and says what is left out', async () => {
      const d = (await report('budget-vs-actual')).body.data;
      expect(d.columns[0]).toBe('Cost Object');
      if (!d.rows.length) return; // no plan this year
      const sum = (k: string) => d.rows.reduce((a: number, r: any) => a + (Number(r[k]) || 0), 0);
      for (const k of ['Budget', 'Actual', 'Committed', 'Remaining']) expect(d.totals[k]).toBeCloseTo(sum(k), 1);
      const monthly = (await report('budget-by-month')).body.data;
      expect(d.totals.Budget).toBeCloseTo(monthly.totals.Budget, 1);
      expect(d.note).toMatch(/Reserve/);
    });
  });

  describe('fiscal year', () => {
    it('tells every signed-in user where the financial year starts', async () => {
      for (const t of [admin, employee]) {
        const r = await get(t, '/budgets/fiscal-year');
        expect(r.status).toBe(200);
        expect(r.body.data.start_month).toBeGreaterThanOrEqual(1);
        expect(r.body.data.start_month).toBeLessThanOrEqual(12);
        expect(Number.isInteger(r.body.data.current_fy)).toBe(true);
      }
    });
  });
});
