import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// Report filters, comparison with the period before, the ids that let a row lead to its records, and ageing as of a date.
// Test data starts with "ZZ" and is dated in 2018; it is removed before and after the run.
// Every delete is keyed on a list of ZZ ids, never on a single id that could be undefined.
describe('Reports phase 3 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string; let manager: string; let employee: string;
  let ids: { admin: number; mgr1: number; emp3: number };
  let c1: number; let c2: number; let catA: number; let catB: number; let catC: number;

  const login = async (username: string, password: string) => {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password });
    if (!r.body?.data?.accessToken) throw new Error(`Login failed for ${username}`);
    return r.body.data.accessToken as string;
  };
  const get = (t: string, url: string) => request(app.getHttpServer()).get(`/api/v1${url}`).set('Authorization', `Bearer ${t}`);
  const report = (t: string, type: string, q = '') => get(t, `/reporting/generate?type=${type}${q}`);
  const MAY = '&dateFrom=2018-05-01&dateTo=2018-05-31';

  const cleanup = async () => {
    const clients = (await prisma.client.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((c) => c.id);
    await prisma.transaction.deleteMany({ where: { description: { startsWith: 'ZZ ' } } });
    if (clients.length) {
      await prisma.invoicePayment.deleteMany({ where: { invoice: { clientId: { in: clients } } } });
      await prisma.invoice.deleteMany({ where: { clientId: { in: clients } } });
      await prisma.client.deleteMany({ where: { id: { in: clients } } });
    }
  };
  const txn = (userId: number, description: string, amount: number, date: string, extra: Record<string, unknown>) => prisma.transaction.create({
    data: { userId, type: 'expense', status: 'APPROVED', contextType: 'project', description, amount, netAmount: amount, totalAmount: amount, dateRecorded: new Date(date), ...extra } as any,
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
    ids = { admin: await id('admin'), mgr1: await id('mgr1'), emp3: await id('emp3') };
    const cats = await prisma.category.findMany({ where: { isActive: true, type: 'expense' }, orderBy: { id: 'asc' }, take: 3 });
    [catA, catB, catC] = cats.map((c) => c.id);
    c1 = (await prisma.client.create({ data: { name: 'ZZ Phase3 client one' } })).id;
    c2 = (await prisma.client.create({ data: { name: 'ZZ Phase3 client two' } })).id;

    await txn(ids.admin, 'ZZ one A', 1000, '2018-05-10', { categoryId: catA, clientId: c1 });
    await txn(ids.admin, 'ZZ two B', 500, '2018-05-11', { categoryId: catB, clientId: c2 });
    const split = await txn(ids.admin, 'ZZ split', 600, '2018-05-12', { categoryId: catA, isSplit: true });
    await prisma.transactionSplit.create({ data: { transactionId: split.id, categoryId: catA, amount: 400, clientId: c1 } });
    await prisma.transactionSplit.create({ data: { transactionId: split.id, categoryId: catB, amount: 200, clientId: c2 } });
    await txn(ids.mgr1, 'ZZ manager A', 300, '2018-05-13', { categoryId: catA, clientId: c1 });
    await txn(ids.emp3, 'ZZ other team A', 90, '2018-05-14', { categoryId: catA, clientId: c2 });
    // The month before: one category that also has spend now, and one that has none now
    await txn(ids.admin, 'ZZ earlier A', 700, '2018-04-10', { categoryId: catA, clientId: c1 });
    await txn(ids.admin, 'ZZ earlier C', 250, '2018-04-12', { categoryId: catC, clientId: c1 });
  }, 60000);

  afterAll(async () => { await cleanup(); await app.close(); });

  describe('filters', () => {
    const total = (d: any) => d.totals['Total Amount'];

    it('narrow a summary to a client, a category or a person, counting only the matching parts of a split', async () => {
      // Client one: 1000, the 400 part of the split, 300 from the manager
      expect(total((await report(admin, 'expense-summary', `${MAY}&clientId=${c1}`)).body.data)).toBe(1700);
      // Category A: 1000, the 400 part, 300, and the other team's 90
      expect(total((await report(admin, 'expense-summary', `${MAY}&categoryId=${catA}`)).body.data)).toBe(1790);
      expect(total((await report(admin, 'expense-summary', `${MAY}&personId=${ids.mgr1}`)).body.data)).toBe(300);
      expect(total((await report(admin, 'expense-summary', `${MAY}&clientId=${c1}&categoryId=${catA}`)).body.data)).toBe(1700);
      // Not a number: ignored, not an error
      expect(total((await report(admin, 'expense-summary', `${MAY}&clientId=abc`)).body.data)).toBe(1000 + 500 + 600 + 300 + 90);
    });

    it('give the same figure in the P&L and the ledger as in the summary', async () => {
      const f = `&clientId=${c1}`;
      expect((await report(admin, 'pl-statement', `${MAY}${f}`)).body.data.totals.Expenses).toBe(1700);
      const ledger = (await report(admin, 'transaction-ledger', `${MAY}${f}&txnType=expense&status=approved`)).body.data;
      expect(ledger.rows.reduce((a: number, r: any) => a + r['Total Amount'], 0)).toBeCloseTo(1700, 2);
      // A split record lists only the part that matches
      expect(ledger.rows.filter((r: any) => r.Description === 'ZZ split')).toHaveLength(1);
      const byCat = (await report(admin, 'transaction-ledger', `${MAY}&txnType=expense&status=approved&categoryId=${catA}`)).body.data;
      expect(byCat.rows.reduce((a: number, r: any) => a + r['Total Amount'], 0)).toBeCloseTo(1790, 2);
    });

    it('never widen what the scope allows', async () => {
      // A manager asking for someone outside their team gets nothing, and their own team is still visible
      expect((await report(manager, 'expense-summary', `${MAY}&personId=${ids.emp3}`)).body.data.rows).toHaveLength(0);
      expect((await report(manager, 'expense-summary', `${MAY}&personId=${ids.mgr1}`)).body.data.totals['Total Amount']).toBe(300);
      const led = (await report(manager, 'transaction-ledger', `${MAY}&personId=${ids.emp3}`)).body.data;
      expect(led.rows.filter((r: any) => String(r.Description).startsWith('ZZ'))).toHaveLength(0);
    });

    it('list the people a user can narrow to: everyone for Finance, the team for a manager, nobody for an employee', async () => {
      const all = (await get(admin, '/reporting/people')).body.data;
      expect(all.length).toBeGreaterThan(5);
      const team = (await get(manager, '/reporting/people')).body.data.map((u: any) => u.username).sort();
      expect(team).toEqual(['emp1', 'emp2', 'mgr1']);
      expect((await get(employee, '/reporting/people')).body.data).toEqual([]);
    });
  });

  describe('compare with the period before', () => {
    it('adds Previous and Change %, and lists a category that has spend only before', async () => {
      const d = (await report(admin, 'expense-summary', `${MAY}&compare=1`)).body.data;
      expect(d.columns).toEqual(expect.arrayContaining(['Previous', 'Change %']));
      const row = (cat: number) => d.rows.find((r: any) => r._categoryId === cat);
      expect(row(catA).Previous).toBe(700);
      expect(row(catA)['Change %']).toBeCloseTo(((1790 - 700) / 700) * 100, 1);
      expect(row(catC)).toMatchObject({ 'Total Amount': 0, Previous: 250, 'Change %': -100 });
      expect(d.totals.Previous).toBe(950);
      expect(d.note).toMatch(/2018-03-31 to 2018-04-30/);
    });

    it('does the same for the Client Summary and notes it in the P&L', async () => {
      const cs = (await report(admin, 'client-summary', `${MAY}&txnType=expense&compare=1`)).body.data;
      expect(cs.columns).toEqual(expect.arrayContaining(['Previous', 'Change %']));
      expect(cs.totals.Previous).toBe(950);
      const pl = (await report(admin, 'pl-statement', `${MAY}&compare=1`)).body.data;
      expect(pl.note).toMatch(/Before this \(2018-03-31 to 2018-04-30\): income 0\.00 \(no change figure\), expenses 950\.00/);
    });

    it('says what is missing when there is no period to compare with', async () => {
      const d = (await report(admin, 'expense-summary', '&compare=1')).body.data;
      expect(d.columns).not.toContain('Previous');
      expect(d.note).toMatch(/Choose a start and end date/);
    });
  });

  describe('drill-through ids', () => {
    it('give each row the ids that lead to its records or its page', async () => {
      const s = (await report(admin, 'expense-summary', MAY)).body.data;
      expect(s.rows.every((r: any) => 'Category' in r && '_categoryId' in r)).toBe(true);
      const cs = (await report(admin, 'client-summary', `${MAY}&txnType=expense`)).body.data;
      expect(cs.rows.find((r: any) => r.Client === 'ZZ Phase3 client one')).toMatchObject({ _clientId: c1, _type: 'expense' });
      // None of these leak into the columns, so exports and the table do not show them
      for (const d of [s, cs]) for (const col of d.columns) expect(col.startsWith('_')).toBe(false);
      const oc = (await report(admin, 'order-costing')).body.data;
      if (oc.rows.length) expect(typeof oc.rows[0]._orderId).toBe('number');
      const pe = (await report(admin, 'project-estimate')).body.data;
      if (pe.rows.length) expect(typeof pe.rows[0]._projectId).toBe('number');
      const pm = (await report(admin, 'product-margin')).body.data;
      if (pm.rows.length) expect(typeof pm.rows[0]._productId).toBe('number');
    });
  });

  describe('receivables ageing as of a date', () => {
    it('counts the invoices and payments that existed on that date', async () => {
      const base = { clientId: c1, taxable: 0, cgst: 0, sgst: 0, igst: 0, roundOff: 0 };
      const inv = await prisma.invoice.create({ data: { ...base, invoiceDate: new Date('2018-03-01'), dueDate: new Date('2018-04-01'), total: 1000, paid: 400, status: 'PART_PAID' } });
      await prisma.invoicePayment.create({ data: { invoiceId: inv.id, paidOn: new Date('2018-05-15'), amount: 400, tds: 0 } });
      await prisma.invoice.create({ data: { ...base, invoiceDate: new Date('2018-05-20'), dueDate: new Date('2018-06-20'), total: 5000, status: 'ISSUED' } });
      await prisma.invoice.create({ data: { ...base, invoiceDate: new Date('2018-03-02'), dueDate: new Date('2018-04-02'), total: 9999, status: 'DRAFT' } });
      const row = (d: any) => d.rows.find((r: any) => r.Client === 'ZZ Phase3 client one');

      // Before the payment and before the second invoice was issued: the whole 1,000, 30 days late
      const may1 = (await report(admin, 'receivables-ageing', '&asOf=2018-05-01')).body.data;
      expect(row(may1)).toMatchObject({ Invoices: 1, Outstanding: 1000, '1-30 Days': 1000 });
      expect(may1.note).toMatch(/as of 2018-05-01/);
      // After the payment and after the second invoice: 600 overdue 61 days, and 5,000 not yet due
      const jun1 = (await report(admin, 'receivables-ageing', '&asOf=2018-06-01')).body.data;
      expect(row(jun1)).toMatchObject({ Invoices: 2, Outstanding: 5600, 'Not Due': 5000, '61-90 Days': 600 });
      // Today's report still uses the invoice's own balance
      const now = (await report(admin, 'receivables-ageing')).body.data;
      expect(row(now)).toMatchObject({ Invoices: 2, Outstanding: 5600, 'Over 90 Days': 5600 });
      expect(now.note).toMatch(/as of today/);
      expect((await report(admin, 'receivables-ageing', '&asOf=nope')).status).toBe(400);
    });
  });
});
