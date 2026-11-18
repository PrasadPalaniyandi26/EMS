import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// Phase 4 reports: the receivables set, the TDS register, GST position, client PO status, project billing and outstanding reimbursements.
// Test data starts with "ZZ" and is dated in 2018; it is removed before and after the run.
describe('Reports phase 4 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string; let employee: string;
  let adminId: number; let categoryId: number; let clientId: number; let otherClientId: number; let projectId: number; let poId: number;

  const login = async (username: string, password: string) => {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password });
    if (!r.body?.data?.accessToken) throw new Error(`Login failed for ${username}`);
    return r.body.data.accessToken as string;
  };
  const get = (t: string, url: string) => request(app.getHttpServer()).get(`/api/v1${url}`).set('Authorization', `Bearer ${t}`);
  const report = (type: string, q = '', t = admin) => get(t, `/reporting/generate?type=${type}${q}`);
  const MAY = '&dateFrom=2018-05-01&dateTo=2018-05-31';
  const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

  const cleanup = async () => {
    await prisma.transaction.deleteMany({ where: { description: { startsWith: 'ZZ ' } } });
    const clients = (await prisma.client.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((c) => c.id);
    if (clients.length) {
      await prisma.invoice.deleteMany({ where: { clientId: { in: clients } } });
      await prisma.clientPo.deleteMany({ where: { clientId: { in: clients } } });
      await prisma.project.deleteMany({ where: { clientId: { in: clients } } });
      await prisma.client.deleteMany({ where: { id: { in: clients } } });
    }
  };

  const invoice = (data: Record<string, unknown>) => prisma.invoice.create({ data: { clientId, status: 'ISSUED', ...data } as any });

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
    clientId = (await prisma.client.create({ data: { name: 'ZZ Phase4 client', gstin: '33ABCDE1234F1Z5' } })).id;
    otherClientId = (await prisma.client.create({ data: { name: 'ZZ Phase4 other' } })).id;
    projectId = (await prisma.project.create({ data: { clientId, name: 'ZZ Phase4 project', contractValue: 10000 } })).id;
    poId = (await prisma.clientPo.create({ data: { clientId, poNumber: 'ZZ-PO-1', poDate: D('2018-04-01'), value: 5000, projectId, validUntil: D('2018-12-31') } })).id;
    await prisma.clientPo.create({ data: { clientId, poNumber: 'ZZ-PO-2', poDate: D('2018-04-02'), value: 800, status: 'CANCELLED' } });

    // March invoice (before the May period), paid in part in April
    const march = await invoice({ number: 'ZZI-1', invoiceDate: D('2018-03-10'), dueDate: D('2018-04-10'), taxable: 1000, cgst: 90, sgst: 90, total: 1180, paid: 500, status: 'PART_PAID' });
    await prisma.invoicePayment.create({ data: { invoiceId: march.id, paidOn: D('2018-04-20'), amount: 500, method: 'BANK', reference: 'APR' } });
    // May invoice against the PO and project, paid with tax held back
    const may = await invoice({ number: 'ZZI-2', invoiceDate: D('2018-05-05'), dueDate: D('2018-06-05'), taxable: 1000, cgst: 100, sgst: 100, total: 1200, paid: 700, tds: 100, status: 'PART_PAID', poId, projectId, buyer: { name: 'ZZ Phase4 client', gstin: '33ABCDE1234F1Z5' } });
    await prisma.invoicePayment.create({ data: { invoiceId: may.id, paidOn: D('2018-05-25'), amount: 700, tds: 100, method: 'UPI', reference: 'MAYREF' } });
    // A cancelled one stays listed with no value
    await invoice({ number: 'ZZI-3', invoiceDate: D('2018-05-07'), dueDate: D('2018-06-07'), taxable: 400, total: 472, status: 'CANCELLED' });
    // Another client's invoice, to prove the client filter
    await prisma.invoice.create({ data: { clientId: otherClientId, number: 'ZZI-4', invoiceDate: D('2018-05-09'), dueDate: D('2018-06-09'), taxable: 300, total: 300, status: 'ISSUED' } });

    // Claimable input GST in May: 180 on a 1180 expense, plus a reimbursement claim
    await prisma.transaction.create({ data: { userId: adminId, type: 'expense', categoryId, status: 'APPROVED', contextType: 'overhead', description: 'ZZ claimable', amount: 1000, netAmount: 1000, totalAmount: 1180, isClaimable: true, dateRecorded: D('2018-05-12') } as any });
    await prisma.transaction.create({ data: { userId: adminId, type: 'expense', categoryId, status: 'APPROVED', contextType: 'overhead', description: 'ZZ claim', amount: 250, netAmount: 250, totalAmount: 250, needsReimbursement: true, dateRecorded: D('2018-05-02') } as any });
  }, 60000);

  afterAll(async () => { await cleanup(); await app.close(); });

  describe('Invoice Register', () => {
    it('lists the period with received, TDS, balance and days overdue, and zeroes a cancelled invoice', async () => {
      const d = (await report('invoice-register', `${MAY}&clientId=${clientId}`)).body.data;
      const by = (no: string) => d.rows.find((r: any) => r['Invoice No'] === no);
      expect(d.rows.map((r: any) => r['Invoice No'])).toEqual(['ZZI-2', 'ZZI-3']);
      expect(by('ZZI-2')).toMatchObject({ 'Invoice Value': 1200, Received: 700, TDS: 100, Balance: 400, Against: 'ZZ Phase4 project', 'Client PO': 'ZZ-PO-1', Status: 'Part Paid' });
      expect(by('ZZI-2')['Days Overdue']).toBeGreaterThan(0);
      expect(by('ZZI-3')).toMatchObject({ 'Invoice Value': 0, Balance: 0, Status: 'Cancelled' });
      expect(d.totals).toMatchObject({ 'Invoice Value': 1200, Received: 700, TDS: 100, Balance: 400 });
    });

    it('is for Finance and Admin only', async () => {
      expect((await report('invoice-register', MAY, employee)).status).toBe(403);
    });
  });

  describe('Client Statement', () => {
    it('needs a client', async () => {
      const r = await report('client-statement', MAY);
      expect(r.status).toBe(400);
      expect(r.body.error?.message ?? r.body.message).toMatch(/Choose a client/);
    });

    it('brings the balance forward and shows the balance after each line, ending at what the client owes', async () => {
      const d = (await report('client-statement', `${MAY}&clientId=${clientId}`)).body.data;
      // Before May: invoiced 1180, received 500 = 680 owed
      expect(d.rows[0]).toMatchObject({ Type: 'Opening', Balance: 680 });
      const lines = d.rows.slice(1);
      expect(lines.map((r: any) => [r.Type, r.Reference, r.Balance])).toEqual([['Invoice', 'ZZI-2', 1880], ['Payment', 'ZZI-2', 1080]]);
      expect(lines[1].Credit).toBe(800); // 700 received plus 100 TDS
      expect(d.totals).toMatchObject({ Debit: 1200, Credit: 800, Balance: 1080 });
      // It ties to the invoice register's open balances for this client
      const reg = (await report('invoice-register', `&clientId=${clientId}`)).body.data;
      expect(d.totals.Balance).toBeCloseTo(reg.totals.Balance, 2);
    });
  });

  describe('Collections and TDS Register', () => {
    it('lists payments received in the period with the tax deducted', async () => {
      const d = (await report('collections', `${MAY}&clientId=${clientId}`)).body.data;
      expect(d.rows).toHaveLength(1);
      expect(d.rows[0]).toMatchObject({ 'Invoice No': 'ZZI-2', Method: 'UPI', Reference: 'MAYREF', Received: 700, TDS: 100, 'Total Credited': 800 });
      expect(d.totals).toMatchObject({ Received: 700, TDS: 100, 'Total Credited': 800 });
      const april = (await report('collections', `&dateFrom=2018-04-01&dateTo=2018-04-30&clientId=${clientId}`)).body.data;
      expect(april.totals.Received).toBe(500);
    });

    it('lists only payments with tax held back, with the PAN taken from the GSTIN', async () => {
      const d = (await report('tds-register', `&dateFrom=2018-04-01&dateTo=2018-05-31&clientId=${clientId}`)).body.data;
      expect(d.rows).toHaveLength(1);
      expect(d.rows[0]).toMatchObject({ 'Invoice No': 'ZZI-2', 'TDS Deducted': 100, PAN: 'ABCDE1234F' });
      expect(d.totals['TDS Deducted']).toBe(100);
    });
  });

  describe('Client PO Status', () => {
    it('shows what is billed and left on a PO and does not add up a cancelled one', async () => {
      const d = (await report('client-po-status', `&clientId=${clientId}`)).body.data;
      const po = d.rows.find((r: any) => r['PO No'] === 'ZZ-PO-1');
      expect(po).toMatchObject({ 'PO Value': 5000, Invoiced: 1000, Remaining: 4000, '% Billed': 20, Status: 'Expired', Against: 'ZZ Phase4 project' });
      expect(d.rows.find((r: any) => r['PO No'] === 'ZZ-PO-2').Status).toBe('Cancelled');
      expect(d.totals).toMatchObject({ 'PO Value': 5000, Invoiced: 1000, Remaining: 4000 });
    });
  });

  describe('GST Position', () => {
    it('sets the GST charged on invoices against the GST claimable on expenses, month by month', async () => {
      const d = (await report('gst-position', MAY)).body.data;
      expect(d.rows).toHaveLength(1);
      // Output: ZZI-2 200 (ZZI-4 carries no tax); input: 180 claimable
      expect(d.rows[0]['Output GST']).toBeGreaterThanOrEqual(200);
      const mine = d.rows[0];
      expect(mine['Net Payable']).toBeCloseTo(mine['Output GST'] - mine['Input GST'], 2);
      expect(mine['Input GST']).toBeGreaterThanOrEqual(180);
      expect(d.totals['Net Payable']).toBeCloseTo(d.totals['Output GST'] - d.totals['Input GST'], 2);
    });
  });

  describe('Project Billing', () => {
    it('compares invoiced with the contract and shows what is received and still owed', async () => {
      const d = (await report('project-billing')).body.data;
      const p = d.rows.find((r: any) => r.Project === 'ZZ Phase4 project');
      expect(p).toMatchObject({ 'Contract Value': 10000, 'Client PO Value': 5000, Invoiced: 1000, '% Billed': 10, Unbilled: 9000, Received: 800, Outstanding: 400 });
    });
  });

  describe('Outstanding Reimbursements', () => {
    it('totals unpaid claims for each employee with how long the oldest has waited', async () => {
      const d = (await report('outstanding-reimbursements')).body.data;
      const row = d.rows.find((r: any) => r.Employee === 'admin');
      expect(row.Pending).toBeGreaterThanOrEqual(250);
      expect(row.Outstanding).toBeCloseTo(row.Pending + row['On Hold'], 2);
      expect(row['Days Waiting']).toBeGreaterThan(0);
      expect(d.totals.Outstanding).toBeCloseTo(d.rows.reduce((a: number, r: any) => a + r.Outstanding, 0), 2);
    });
  });
});
