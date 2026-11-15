import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcryptjs';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { invoiceNumber, taxOf, totalsOf } from './../src/invoicing/gst';

// Client POs and invoices: the tax split, the number, who may do what, payments that become income, and the rules that keep issued invoices fixed.
// Test clients are named "ZZ ..." and everything dated in 2018; the data is removed, and the invoice counter and company details put back, after the run.
describe('Client invoicing (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string; let finance: string; let manager: string; let employee: string; let ops: string;
  let tnClient: number; let kaClient: number;
  let savedCounter = 10000;
  let savedCompany: any = null;

  const login = async (username: string, password: string) => {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password });
    if (!r.body?.data?.accessToken) throw new Error(`Login failed for ${username}`);
    return r.body.data.accessToken as string;
  };
  const call = (m: 'get' | 'post' | 'put' | 'delete', t: string, url: string, body?: object) => {
    const r = (request(app.getHttpServer()) as any)[m](`/api/v1${url}`).set('Authorization', `Bearer ${t}`);
    return body ? r.send(body) : r;
  };
  const line = (o: object = {}) => ({ description: 'Controls panel', hsn: '8537', quantity: 2, unit: 'nos', rate: 1000, gst_rate: 18, ...o });
  const draft = async (client: number, o: any = {}, t = finance) => {
    const r = await call('post', t, '/invoices', { client_id: client, invoice_date: '2018-06-10', lines: [line()], ...o });
    return r;
  };

  const cleanup = async () => {
    const clients = (await prisma.client.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((c) => c.id);
    if (clients.length) {
      await prisma.invoicePayment.deleteMany({ where: { invoice: { clientId: { in: clients } } } });
      await prisma.transaction.deleteMany({ where: { clientId: { in: clients } } });
      await prisma.invoice.deleteMany({ where: { clientId: { in: clients } } });
      await prisma.clientPo.deleteMany({ where: { clientId: { in: clients } } });
      await prisma.buildOrder.deleteMany({ where: { code: { startsWith: 'ZZ-' } } });
      await prisma.project.deleteMany({ where: { clientId: { in: clients } } });
      await prisma.client.deleteMany({ where: { id: { in: clients } } });
    }
    await prisma.periodLock.deleteMany({ where: { year: 2018, month: 5 } });
    const zz = await prisma.user.findMany({ where: { username: 'zzops' }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { changedBy: { in: zz.map((u) => u.id) } } });
    await prisma.refreshToken.deleteMany({ where: { user: { username: 'zzops' } } });
    await prisma.userRole.deleteMany({ where: { user: { username: 'zzops' } } });
    await prisma.user.deleteMany({ where: { username: 'zzops' } });
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
    savedCounter = (await prisma.invoiceCounter.findUniqueOrThrow({ where: { id: 1 } })).lastSeq;
    savedCompany = await prisma.companyProfile.findUnique({ where: { id: 1 } });
    const role = await prisma.role.findFirstOrThrow({ where: { name: 'OPERATIONS' } });
    const u = await prisma.user.create({ data: { username: 'zzops', loginName: 'zzops', email: 'zzops@example.com', passwordHash: await bcrypt.hash('Test@1234', 10), role: 'operations', roleId: role.id } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id, isDefault: true } });
    admin = await login('admin', 'admin123'); finance = await login('fin1', 'Test@1234'); manager = await login('mgr1', 'Test@1234'); employee = await login('emp1', 'Test@1234'); ops = await login('zzops', 'Test@1234');
    tnClient = (await prisma.client.create({ data: { name: 'ZZ Tamil Nadu client', gstin: '33ABCDE1234F1Z5', state: 'Tamil Nadu', paymentTermsDays: 30 } })).id;
    kaClient = (await prisma.client.create({ data: { name: 'ZZ Karnataka client', gstin: '29ABCDE1234F1Z5', state: 'Karnataka', paymentTermsDays: 45 } })).id;
    const r = await call('put', finance, '/company-profile', { legal_name: 'ZZ Test Company', gstin: '33AAAAA0000A1Z5', state: 'Tamil Nadu', address_line: '1 Test Street', city: 'Chennai', bank_name: 'Test Bank', bank_account: '1234567890', bank_ifsc: 'HDFC0001234', signatory: 'A Signatory' });
    if (r.status !== 200) throw new Error('Could not set the company details: ' + JSON.stringify(r.body));
  }, 90000);

  afterAll(async () => {
    await cleanup();
    await prisma.invoiceCounter.update({ where: { id: 1 }, data: { lastSeq: savedCounter } });
    if (savedCompany) await prisma.companyProfile.update({ where: { id: 1 }, data: { legalName: savedCompany.legalName, gstin: savedCompany.gstin, pan: savedCompany.pan, addressLine: savedCompany.addressLine, city: savedCompany.city, state: savedCompany.state, postalCode: savedCompany.postalCode, email: savedCompany.email, phone: savedCompany.phone, bankName: savedCompany.bankName, bankAccount: savedCompany.bankAccount, bankIfsc: savedCompany.bankIfsc, terms: savedCompany.terms, signatory: savedCompany.signatory } });
    else await prisma.companyProfile.deleteMany({ where: { id: 1 } });
    await app.close();
  });

  describe('the rules in the code', () => {
    it('numbers an invoice NTIN-YYMM-NNNNN from the invoice date', () => {
      expect(invoiceNumber(new Date('2026-11-14T00:00:00Z'), 10001)).toBe('NTIN-2611-10001');
      expect(invoiceNumber(new Date('2027-01-02T00:00:00Z'), 10002)).toBe('NTIN-2701-10002');
      expect(invoiceNumber(new Date('2026-11-14T00:00:00Z'), 99999)).toHaveLength(15);
    });
    it('splits tax in half inside the state and charges IGST across states', () => {
      expect(taxOf({ quantity: 2, rate: 1000, gstRate: 18 }, 'INTRA')).toEqual({ taxable: 2000, cgst: 180, sgst: 180, igst: 0 });
      expect(taxOf({ quantity: 2, rate: 1000, gstRate: 18 }, 'INTER')).toEqual({ taxable: 2000, cgst: 0, sgst: 0, igst: 360 });
    });
    it('rounds the total to the rupee and shows the difference', () => {
      const t = totalsOf([taxOf({ quantity: 1, rate: 100.1, gstRate: 5 }, 'INTRA')]);
      expect(t.total).toBe(105);
      expect(t.round_off).toBeCloseTo(-0.1, 2);
    });
  });

  describe('company details and client GSTIN', () => {
    it('is closed to everyone but Admin and Finance for saving, and checks what is entered', async () => {
      expect((await call('put', ops, '/company-profile', { legal_name: 'x' })).status).toBe(403);
      expect((await call('put', finance, '/company-profile', { legal_name: 'X', gstin: 'NOTAGSTIN' })).status).toBe(400);
      expect((await call('put', finance, '/company-profile', { legal_name: 'X', gstin: '33AAAAA0000A1Z5', state: 'Karnataka' })).status).toBe(400);
      expect((await call('put', finance, '/company-profile', { legal_name: 'X', bank_ifsc: 'bad' })).status).toBe(400);
      expect((await call('get', manager, '/company-profile')).status).toBe(200);
    });
    it('refuses a bad client GSTIN or payment terms, or a state that does not match', async () => {
      expect((await call('put', admin, `/clients/${tnClient}`, { gstin: '123' })).status).toBe(400);
      expect((await call('put', admin, `/clients/${tnClient}`, { payment_terms_days: -1 })).status).toBe(400);
      expect((await call('put', admin, `/clients/${tnClient}`, { state: 'Kerala' })).status).toBe(400);
      const ok = await call('put', admin, `/clients/${tnClient}`, { payment_terms_days: 30 });
      expect(ok.status).toBe(200);
      expect(ok.body.data.gstin).toBe('33ABCDE1234F1Z5');
    });
  });

  describe('purchase orders', () => {
    it('lets Operations add one, refuses a Manager or an employee, and refuses a duplicate number', async () => {
      const body = { client_id: tnClient, po_number: 'ZZ-PO-1', po_date: '2018-06-01', value: 10000 };
      const a = await call('post', ops, '/client-pos', body);
      expect(a.status).toBe(201);
      expect(a.body.data.balance).toBe(10000);
      expect((await call('post', ops, '/client-pos', body)).status).toBe(409);
      expect((await call('post', manager, '/client-pos', { ...body, po_number: 'ZZ-PO-2' })).status).toBe(403);
      expect((await call('get', manager, '/client-pos')).status).toBe(200);
      expect((await call('get', employee, '/client-pos')).status).toBe(403);
    });
    it('refuses a value of zero and a valid-until before the PO date', async () => {
      expect((await call('post', ops, '/client-pos', { client_id: tnClient, po_number: 'ZZ-PO-3', po_date: '2018-06-01', value: 0 })).status).toBe(400);
      expect((await call('post', ops, '/client-pos', { client_id: tnClient, po_number: 'ZZ-PO-3', po_date: '2018-06-01', value: 5, valid_until: '2018-05-01' })).status).toBe(400);
    });
  });

  describe('a draft invoice', () => {
    it('works out CGST and SGST for a client in the same state, and has no number yet', async () => {
      const r = await draft(tnClient);
      expect(r.status).toBe(201);
      const d = r.body.data;
      expect(d.number).toBeNull(); expect(d.status).toBe('DRAFT');
      expect([d.taxable, d.cgst, d.sgst, d.igst, d.total]).toEqual([2000, 180, 180, 0, 2360]);
      expect(d.due_date).toBe('2018-07-10');
    });
    it('works out IGST for a client in another state, and takes that client’s payment terms', async () => {
      const d = (await draft(kaClient)).body.data;
      expect([d.cgst, d.sgst, d.igst, d.total]).toEqual([0, 0, 360, 2360]);
      expect(d.due_date).toBe('2018-07-25');
    });
    it('can be prepared by Operations but not by a Manager', async () => {
      expect((await draft(tnClient, {}, ops)).status).toBe(201);
      expect((await draft(tnClient, {}, manager)).status).toBe(403);
    });
    it('refuses a bad line, no lines, and a due date before the invoice date', async () => {
      expect((await draft(tnClient, { lines: [] })).status).toBe(400);
      expect((await draft(tnClient, { lines: [line({ quantity: 0 })] })).status).toBe(400);
      expect((await draft(tnClient, { lines: [line({ gst_rate: 40 })] })).status).toBe(400);
      expect((await draft(tnClient, { lines: [line({ hsn: 'ABC' })] })).status).toBe(400);
      expect((await draft(tnClient, { due_date: '2018-06-01' })).status).toBe(400);
    });
    it('can be edited and deleted while it is a draft', async () => {
      const id = (await draft(tnClient)).body.data.id;
      const up = await call('put', ops, `/invoices/${id}`, { lines: [line({ quantity: 1 })] });
      expect(up.status).toBe(200);
      expect(up.body.data.total).toBe(1180);
      expect((await call('delete', ops, `/invoices/${id}`)).status).toBe(200);
    });
  });

  describe('issuing', () => {
    it('is for Admin and Finance only, and gives consecutive numbers that start from the invoice date', async () => {
      const a = (await draft(tnClient)).body.data.id; const b = (await draft(kaClient)).body.data.id;
      expect((await call('post', ops, `/invoices/${a}/issue`)).status).toBe(403);
      expect((await call('post', manager, `/invoices/${a}/issue`)).status).toBe(403);
      const x = (await call('post', finance, `/invoices/${a}/issue`)).body.data;
      const y = (await call('post', admin, `/invoices/${b}/issue`)).body.data;
      expect(x.number).toMatch(/^NTIN-1806-\d{5}$/);
      expect(Number(y.number.slice(-5))).toBe(Number(x.number.slice(-5)) + 1);
      expect(Number(x.number.slice(-5))).toBeGreaterThanOrEqual(10001);
      expect(x.status).toBe('ISSUED');
      expect(x.seller.gstin).toBe('33AAAAA0000A1Z5'); expect(x.buyer.gstin).toBe('33ABCDE1234F1Z5');
      expect(y.supply_type).toBe('INTER');
    });
    it('never gives the same number twice when two are issued at the same moment', async () => {
      const ids = await Promise.all([1, 2, 3, 4].map(async () => (await draft(tnClient)).body.data.id));
      const out = await Promise.all(ids.map((id) => call('post', finance, `/invoices/${id}/issue`)));
      expect(out.every((r) => r.status === 201)).toBe(true);
      const numbers = out.map((r) => r.body.data.number);
      expect(new Set(numbers).size).toBe(4);
    });
    it('freezes the invoice: no edit, no delete, and the client can change without changing it', async () => {
      const id = (await draft(tnClient)).body.data.id;
      await call('post', finance, `/invoices/${id}/issue`);
      expect((await call('put', finance, `/invoices/${id}`, { notes: 'x' })).status).toBe(409);
      expect((await call('delete', finance, `/invoices/${id}`)).status).toBe(409);
      expect((await call('post', finance, `/invoices/${id}/issue`)).status).toBe(409);
    });
    it('refuses a client whose state is unknown, and an invoice dated in a closed month', async () => {
      const blank = (await prisma.client.create({ data: { name: 'ZZ No state client' } })).id;
      const d1 = (await draft(blank)).body.data.id;
      expect((await call('post', finance, `/invoices/${d1}/issue`)).status).toBe(400);
      const d2 = (await draft(tnClient, { invoice_date: '2018-05-10' })).body.data.id;
      await prisma.periodLock.create({ data: { year: 2018, month: 5 } });
      expect((await call('post', finance, `/invoices/${d2}/issue`)).status).toBe(409);
      await prisma.periodLock.deleteMany({ where: { year: 2018, month: 5 } });
    });
    it('refuses a date in the future', async () => {
      const d = (await draft(tnClient, { invoice_date: '2999-01-01' })).body.data.id;
      expect((await call('post', finance, `/invoices/${d}/issue`)).status).toBe(400);
    });
  });

  describe('payments', () => {
    let id: number;
    beforeAll(async () => {
      id = (await draft(tnClient)).body.data.id;
      await call('post', finance, `/invoices/${id}/issue`);
    });

    it('is for Admin and Finance only, and refuses a payment that is more than the balance', async () => {
      expect((await call('post', ops, `/invoices/${id}/payments`, { paid_on: '2018-06-20', amount: 100 })).status).toBe(403);
      expect((await call('post', finance, `/invoices/${id}/payments`, { paid_on: '2018-06-20', amount: 99999 })).status).toBe(400);
      expect((await call('post', finance, `/invoices/${id}/payments`, { paid_on: '2018-06-01', amount: 100 })).status).toBe(400);
    });

    it('turns a payment into one approved Income entry and moves the invoice to part paid', async () => {
      const r = await call('post', finance, `/invoices/${id}/payments`, { paid_on: '2018-06-20', amount: 1000, method: 'bank', reference: 'UTR1' });
      expect(r.status).toBe(201);
      const d = r.body.data;
      expect([d.status, d.paid, d.balance]).toEqual(['PART_PAID', 1000, 1360]);
      const inc = await prisma.transaction.findMany({ where: { clientId: tnClient, type: 'income', description: { contains: d.number } } });
      expect(inc).toHaveLength(1);
      expect(inc[0].status).toBe('APPROVED');
      expect(Number(inc[0].amount)).toBe(1000);
      expect(inc[0].referenceId).toMatch(/^INC-\d+$/);
    });

    it('counts TDS towards the invoice being paid, without making income of it', async () => {
      const r = await call('post', finance, `/invoices/${id}/payments`, { paid_on: '2018-06-25', amount: 1224, tds: 136 });
      expect(r.body.data.status).toBe('PAID');
      expect(r.body.data.balance).toBe(0);
      const inc = await prisma.transaction.findMany({ where: { clientId: tnClient, type: 'income', description: { contains: r.body.data.number } } });
      expect(inc.map((t) => Number(t.amount)).sort((a, b) => a - b)).toEqual([1000, 1224]);
      expect((await call('post', finance, `/invoices/${id}/payments`, { paid_on: '2018-06-26', amount: 1 })).status).toBe(409);
    });

    it('cannot have its income voided from the Income page, only removed on the invoice', async () => {
      const inv = (await call('get', finance, `/invoices/${id}`)).body.data;
      const t = await prisma.transaction.findFirstOrThrow({ where: { id: inv.payments[0].transaction_id } });
      expect((await call('post', finance, `/transactions/${t.id}/void`, { reason: 'try' })).status).toBe(409);
      const r = await call('delete', finance, `/invoices/${id}/payments/${inv.payments[0].id}`);
      expect(r.status).toBe(200);
      expect(r.body.data.status).toBe('PART_PAID');
      expect((await prisma.transaction.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('VOIDED');
    });

    it('cannot be cancelled while payments are on it, and the cancel needs a reason', async () => {
      expect((await call('post', finance, `/invoices/${id}/cancel`, { reason: 'x' })).status).toBe(400);
      expect((await call('post', finance, `/invoices/${id}/cancel`, { reason: 'Raised in error' })).status).toBe(409);
    });
  });

  describe('POs and invoices together', () => {
    it('closes a PO when it has been invoiced in full, and reopens it when that invoice is cancelled', async () => {
      const po = (await call('post', ops, '/client-pos', { client_id: kaClient, po_number: 'ZZ-PO-FULL', po_date: '2018-06-01', value: 2000 })).body.data;
      const inv = (await draft(kaClient, { po_id: po.id })).body.data;
      expect((await call('get', ops, `/client-pos/${po.id}`)).body.data.status).toBe('OPEN');
      await call('post', finance, `/invoices/${inv.id}/issue`);
      const closed = (await call('get', ops, `/client-pos/${po.id}`)).body.data;
      expect([closed.status, closed.auto_closed, closed.invoiced, closed.balance]).toEqual(['CLOSED', true, 2000, 0]);
      expect((await call('put', ops, `/client-pos/${po.id}`, { note: 'x' })).status).toBe(409);
      const c = await call('post', finance, `/invoices/${inv.id}/cancel`, { reason: 'Wrong rate' });
      expect(c.status).toBe(201);
      expect(c.body.data.status).toBe('CANCELLED');
      expect((await call('get', ops, `/client-pos/${po.id}`)).body.data.status).toBe('OPEN');
    });
    it('refuses an invoice for a PO that belongs to another client, and a PO delete once invoices exist', async () => {
      const po = (await call('post', ops, '/client-pos', { client_id: kaClient, po_number: 'ZZ-PO-OTHER', po_date: '2018-06-01', value: 5000 })).body.data;
      expect((await draft(tnClient, { po_id: po.id })).status).toBe(400);
      await draft(kaClient, { po_id: po.id });
      expect((await call('delete', ops, `/client-pos/${po.id}`)).status).toBe(409);
      expect((await call('post', ops, `/client-pos/${po.id}/cancel`)).status).toBe(409);
    });
  });

  describe('what clients owe', () => {
    it('adds up what is billed, received and outstanding per client', async () => {
      const r = await call('get', manager, '/invoices/summary');
      expect(r.status).toBe(200);
      const row = r.body.data.rows.find((x: any) => x.client_id === tnClient);
      expect(row.billed).toBeGreaterThan(0);
      expect(row.outstanding).toBeCloseTo(row.billed - row.received, 2);
      expect(r.body.data.totals.outstanding).toBeGreaterThanOrEqual(row.outstanding);
    });
    it('shows an issued invoice past its due date as overdue', async () => {
      const r = await call('get', finance, '/invoices?status=OVERDUE');
      expect(r.status).toBe(200);
      expect(r.body.data.length).toBeGreaterThan(0);
      expect(r.body.data.every((i: any) => i.overdue && i.balance > 0)).toBe(true);
    });
  });

  describe('a project and an order', () => {
    // -1 matches no row; an undefined id in these deleteMany filters would match every project and order
    let projectId = -1; let orderId = -1;
    beforeAll(async () => {
      projectId = (await prisma.project.create({ data: { clientId: tnClient, name: 'ZZ Billing project', contractValue: 10000 } })).id;
      const product = await prisma.product.findFirstOrThrow();
      orderId = (await prisma.buildOrder.create({ data: { code: 'ZZ-BO-1', productId: product.id, clientId: kaClient, quantity: 4, unitPrice: 500, startDate: new Date('2018-06-01'), deliveryDate: new Date('2018-07-01') } })).id;
    });
    afterAll(async () => {
      await prisma.invoicePayment.deleteMany({ where: { invoice: { OR: [{ projectId }, { buildOrderId: orderId }] } } });
      await prisma.invoice.deleteMany({ where: { OR: [{ projectId }, { buildOrderId: orderId }] } });
      await prisma.clientPo.deleteMany({ where: { OR: [{ projectId }, { buildOrderId: orderId }] } });
      await prisma.buildOrder.deleteMany({ where: { id: orderId } });
      await prisma.project.deleteMany({ where: { id: projectId } });
    });

    it('adds up the POs and invoices of a project, whether an invoice names the project or sits on its PO', async () => {
      const po = (await call('post', ops, '/client-pos', { client_id: tnClient, po_number: 'ZZ-PO-PRJ', po_date: '2018-06-01', value: 6000, project_id: projectId })).body.data;
      const viaPo = (await draft(tnClient, { po_id: po.id })).body.data;
      const direct = (await draft(tnClient, { project_id: projectId })).body.data;
      const loose = (await draft(tnClient, { project_id: projectId })).body.data;
      await call('post', finance, `/invoices/${viaPo.id}/issue`); await call('post', finance, `/invoices/${direct.id}/issue`);
      const r = await call('get', manager, `/invoices/billing?projectId=${projectId}`);
      expect(r.status).toBe(200);
      const b = r.body.data;
      expect([b.contract_value, b.po_value, b.invoiced, b.to_invoice, b.invoiced_pct]).toEqual([10000, 6000, 4000, 6000, 40]);
      expect(b.pos).toEqual([expect.objectContaining({ po_number: 'ZZ-PO-PRJ', value: 6000, invoiced: 2000 })]);
      expect(b.invoices).toHaveLength(3);
      expect(b.drafts).toBe(1);
      expect(b.outstanding).toBeCloseTo(2 * 2360, 2);
      expect(loose.id).toBeGreaterThan(0);
    });

    it('measures an order against its quantity times its price', async () => {
      const po = (await call('post', ops, '/client-pos', { client_id: kaClient, po_number: 'ZZ-PO-ORD', po_date: '2018-06-01', value: 2000, build_order_id: orderId })).body.data;
      const inv = (await draft(kaClient, { po_id: po.id })).body.data;
      await call('post', finance, `/invoices/${inv.id}/issue`);
      const b = (await call('get', finance, `/invoices/billing?buildOrderId=${orderId}`)).body.data;
      expect([b.contract_value, b.invoiced, b.invoiced_pct, b.to_invoice]).toEqual([2000, 2000, 100, 0]);
      expect(b.pos[0].status).toBe('CLOSED');
    });

    it('needs exactly one of project or order, and is not for employees', async () => {
      expect((await call('get', finance, '/invoices/billing')).status).toBe(400);
      expect((await call('get', finance, `/invoices/billing?projectId=${projectId}&buildOrderId=${orderId}`)).status).toBe(400);
      expect((await call('get', finance, '/invoices/billing?projectId=99999999')).status).toBe(404);
      expect((await call('get', employee, `/invoices/billing?projectId=${projectId}`)).status).toBe(403);
    });
  });

  describe('reports and Home', () => {
    const report = (t: string, type: string, q = '') => call('get', t, `/reporting/generate?type=${type}${q}`);

    it('ages what each client owes by how long it has been due, for Finance and Admin only', async () => {
      const r = await report(finance, 'receivables-ageing');
      expect(r.status).toBe(200);
      const row = r.body.data.rows.find((x: any) => x.Client === 'ZZ Tamil Nadu client');
      expect(row['Over 90 Days']).toBeGreaterThan(0);
      const parts = ['Not Due', '1-30 Days', '31-60 Days', '61-90 Days', 'Over 90 Days'].reduce((a, k) => a + row[k], 0);
      expect(row.Outstanding).toBeCloseTo(parts, 2);
      expect(r.body.data.totals.Outstanding).toBeGreaterThanOrEqual(row.Outstanding);
      expect((await report(admin, 'receivables-ageing')).status).toBe(200);
      expect((await report(manager, 'receivables-ageing')).status).toBe(403);
      expect((await report(ops, 'receivables-ageing')).status).toBe(403);
    });

    it('lists the invoices issued in the period with the tax split, and keeps a cancelled one at no value', async () => {
      const r = await report(finance, 'gst-sales-register', '&dateFrom=2018-06-01&dateTo=2018-06-30');
      expect(r.status).toBe(200);
      const rows = r.body.data.rows as any[];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((x) => /^NTIN-1806-\d{5}$/.test(x['Invoice No']))).toBe(true);
      const live = rows.filter((x) => x.Status === 'Issued');
      expect(r.body.data.totals.Taxable).toBeCloseTo(live.reduce((a, x) => a + x.Taxable, 0), 2);
      expect(r.body.data.totals['Invoice Value']).toBeCloseTo(live.reduce((a, x) => a + x['Invoice Value'], 0), 2);
      const tn = rows.find((x) => x.Client === 'ZZ Tamil Nadu client');
      expect([tn.CGST, tn.SGST, tn.IGST]).toEqual([tn.CGST, tn.CGST, 0]);
      const ka = rows.find((x) => x.Client === 'ZZ Karnataka client' && x.Status === 'Issued');
      expect([ka.CGST, ka.SGST]).toEqual([0, 0]);
      expect(ka.IGST).toBeGreaterThan(0);
      const gone = rows.find((x) => x.Status === 'Cancelled');
      expect(gone['Invoice Value']).toBe(0);
      expect((await report(manager, 'gst-sales-register')).status).toBe(403);
    });

    it('shows what clients owe on Home to the roles that can see invoices, and raises an overdue item', async () => {
      const r = await call('get', manager, '/dashboard/overview');
      expect(r.status).toBe(200);
      const rec = r.body.data.receivables;
      expect(rec.overdue).toBeGreaterThan(0);
      expect(rec.outstanding).toBeGreaterThanOrEqual(rec.overdue);
      expect(rec.top.length).toBeGreaterThan(0);
      expect(r.body.data.attention.some((a: any) => a.key === 'inv-overdue' && a.href === '/manage/clients?tab=invoices')).toBe(true);
      const e = await call('get', employee, '/dashboard/overview');
      if (e.status === 200) expect(e.body.data.receivables).toBeNull();
    });
  });
});
