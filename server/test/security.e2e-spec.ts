import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { today as businessToday } from './../src/common/helpers/dates';
import { applyEdgeSecurity } from './../src/common/security';
import * as bcrypt from 'bcryptjs';
import { RecurringService } from './../src/recurring/recurring.service';
import { BudgetsService } from './../src/budgets/budgets.service';
import { TransactionsService } from './../src/transactions/transactions.service';
import cookieParser from 'cookie-parser';

// Findings of the 26 Nov 2026 security audit. Each test fails on the code as it was audited.
// Test data starts with "ZZ" and is removed before and after the run.
type Res = { status: number; body: any; headers: Record<string, string> };

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
const HTML = Buffer.from('<html><script>document.title = 1</script></html>');

describe('Security audit fixes (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};
  let categoryId: number;
  let projectId: number;

  const call = async (method: 'get' | 'post' | 'put' | 'delete', url: string, who: string, body?: unknown): Promise<Res> => {
    let res: Res = { status: 0, body: {}, headers: {} };
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = request(app.getHttpServer())[method](`/api/v1${url}`).set('Authorization', `Bearer ${tokens[who]}`);
      const out = body === undefined ? await r : await r.send(body as object);
      res = { status: out.status, body: out.body, headers: out.headers as Record<string, string> };
      if (out.status !== 429) return res;
      await new Promise((resolve) => setTimeout(resolve, 12000));
    }
    return res;
  };
  const upload = async (who: string, content: Buffer, filename: string, contentType: string) => {
    const r = await request(app.getHttpServer()).post('/api/v1/receipts/upload').set('Authorization', `Bearer ${tokens[who]}`).attach('receipt', content, { filename, contentType });
    return { status: r.status, filename: r.body?.data?.filename as string | undefined };
  };
  const today = () => businessToday().toISOString().slice(0, 10);
  const expense = (extra: Record<string, unknown> = {}) => ({ type: 'expense', amount: 100, dateRecorded: today(), description: 'ZZsec expense', paymentMethod: 'cash', categoryId, contextType: 'project', projectId, overBudgetReason: 'ZZsec test reason', ...extra });

  const YEARS = [2091, 2092];
  const monthly = (amount: number) => Array.from({ length: 12 }, () => amount);

  const cleanup = async () => {
    const bills = (await prisma.invoice.findMany({ where: { number: { startsWith: 'ZZSEC' } }, select: { id: true } })).map((i) => i.id);
    await prisma.invoicePayment.deleteMany({ where: { invoiceId: { in: bills } } });
    await prisma.invoice.deleteMany({ where: { id: { in: bills } } });
    await prisma.transaction.deleteMany({ where: { description: { startsWith: 'Payment for ZZSEC' } } });
    const lines = (await prisma.budgetLine.findMany({ where: { plan: { fy: { in: YEARS } } }, select: { id: true } })).map((l) => l.id);
    await prisma.budgetChange.deleteMany({ where: { reason: { startsWith: 'ZZsec' } } });
    await prisma.varianceNote.deleteMany({ where: { lineId: { in: lines } } });
    await prisma.budgetLinePeriod.deleteMany({ where: { lineId: { in: lines } } });
    await prisma.budgetLine.deleteMany({ where: { id: { in: lines } } });
    await prisma.budgetPlan.deleteMany({ where: { fy: { in: YEARS } } });
    await prisma.transactionNote.deleteMany({ where: { transaction: { description: { contains: 'ZZsec' } } } });
    await prisma.approvalRequest.deleteMany({ where: { transaction: { description: { contains: 'ZZsec' } } } });
    await prisma.transaction.deleteMany({ where: { description: { contains: 'ZZsec' } } });
    await prisma.approvalRequest.deleteMany({ where: { recurringTransaction: { description: { startsWith: 'ZZsec' } } } });
    await prisma.recurringTransaction.deleteMany({ where: { description: { startsWith: 'ZZsec' } } });
    const made = { user: { loginName: { startsWith: 'zzsec' } } };
    await prisma.refreshToken.deleteMany({ where: made });
    await prisma.notification.deleteMany({ where: made });
    await prisma.userRole.deleteMany({ where: made });
    await prisma.auditLog.deleteMany({ where: made });
    await prisma.user.deleteMany({ where: { loginName: { startsWith: 'zzsec' } } });
  };
  // A throwaway account holding one role
  const account = async (name: string, roleName: string, extra: Record<string, unknown> = {}) => {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    const u = await prisma.user.create({ data: { username: name, loginName: name, email: `${name}@test.local`, passwordHash: await bcrypt.hash('Test@1234', 4), roleId: role.id, ...extra } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id, isDefault: true } });
    return u.id;
  };
  const signIn = (username: string, password: string, from = '198.51.100.1') => request(app.getHttpServer()).post('/api/v1/auth/login').set('X-Forwarded-For', from).send({ username, password });
  const session = async (username: string) => {
    const r = await signIn(username, 'Test@1234');
    const cookie = String(r.headers['set-cookie']).split(';')[0];
    tokens[username] = r.body.data.accessToken;
    return cookie;
  };
  const refresh = (cookie: string) => request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookie).send({});

  const dayFromToday = (n: number) => new Date(businessToday().getTime() + n * 86400000).toISOString().slice(0, 10);
  const schedule = async (who: string) => {
    const r = await call('post', '/recurring', who, { amount: 500, category_id: categoryId, description: 'ZZsec schedule', frequency: 'yearly', next_run: today(), payment_method: 'card', project_id: projectId, context_type: 'project' });
    expect(r.status).toBe(201);
    expect((await call('post', `/recurring/${r.body.data.id}/submit`, who)).status).toBe(201);
    return r.body.data.id as number;
  };
  // An approved schedule that is due today, written straight to the database
  const dueSchedule = (userId: number) => prisma.recurringTransaction.create({ data: { userId, description: 'ZZsec due', amount: 700, totalAmount: 700, netAmount: 700, categoryId, projectId, contextType: 'project', frequency: 'monthly', nextRunDate: businessToday(), status: 'APPROVED', isActive: true } });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.use(cookieParser());
    applyEdgeSecurity(app);
    await app.init();
    prisma = app.get(PrismaService);
    await cleanup();
    for (const who of ['admin', 'fin1', 'fin2', 'mgr1', 'mgr2', 'emp1', 'emp2']) {
      const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username: who, password: who === 'admin' ? 'admin123' : 'Test@1234' });
      if (!r.body?.data?.accessToken) throw new Error(`Login failed for ${who} (${r.status})`);
      tokens[who] = r.body.data.accessToken;
      ids[who] = r.body.data.user.id;
    }
    categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true, type: 'expense' }, orderBy: { id: 'asc' } })).id;
    projectId = (await prisma.project.findFirstOrThrow()).id;
  }, 60000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('receipts', () => {
    it('refuses a web page that claims to be an image', async () => {
      const r = await upload('emp1', HTML, 'x.html', 'image/png');
      expect(r.status).toBe(400);
    });

    it('names a file by what it contains, whatever it was called', async () => {
      const r = await upload('emp1', PNG, 'x.html', 'image/png');
      expect(r.status).toBe(201);
      expect(r.filename).toMatch(new RegExp(`^u${ids.emp1}-[0-9a-f-]{36}\\.png$`));
      const file = await call('get', `/receipts/${r.filename}`, 'emp1');
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toBe('image/png');
      expect(file.headers['x-content-type-options']).toBe('nosniff');
    });

    it('refuses an attachment that points anywhere but your own upload', async () => {
      const theirs = (await upload('emp2', PNG, 'a.png', 'image/png')).filename;
      for (const receiptPath of ['//example.test/x.pdf', '/\\example.test/x', '../users', theirs]) {
        expect((await call('post', '/transactions', 'emp1', expense({ receiptPath }))).status).toBe(400);
      }
      const made = await call('post', '/transactions', 'emp1', expense());
      expect((await call('put', `/transactions/${made.body.data.id}`, 'emp1', { receiptPath: '//example.test/x' })).status).toBe(400);
    });

    it('shows a file only to its owner and to those who can see its record', async () => {
      const name = (await upload('emp1', PNG, 'a.png', 'image/png')).filename!;
      expect((await call('get', `/receipts/${name}`, 'emp2')).status).toBe(404);
      expect((await call('get', `/receipts/${name}`, 'mgr1')).status).toBe(404); // not on a record yet
      expect((await call('post', '/transactions', 'emp1', expense({ receiptPath: name }))).status).toBe(201);
      expect((await call('get', `/receipts/${name}`, 'mgr1')).status).toBe(200);
      expect((await call('get', `/receipts/${name}`, 'emp2')).status).toBe(404);
    });
  });

  describe('sign-in and roles', () => {
    it('stops repeated wrong passwords without blocking correct sign-ins or other people', async () => {
      await account('zzsecthrottle', 'EMPLOYEE');
      await account('zzsecother', 'EMPLOYEE');
      for (let i = 0; i < 10; i++) expect((await signIn('zzsecthrottle', 'wrong')).status).toBe(401);
      expect((await signIn('zzsecthrottle', 'wrong')).status).toBe(429);
      expect((await signIn('zzsecother', 'Test@1234')).status).toBe(200);
      // Behind a proxy each caller is counted on their own address
      expect((await signIn('zzsecthrottle', 'Test@1234', '198.51.100.2')).status).toBe(200);
      for (let i = 0; i < 15; i++) expect((await signIn('zzsecother', 'Test@1234')).status).toBe(200);
    });

    it('gives no access from the old role column', async () => {
      await account('zzsecdemoted', 'EMPLOYEE', { role: 'admin' });
      await session('zzsecdemoted');
      expect((await call('get', '/audit', 'zzsecdemoted')).status).toBe(403);
    });

    it('applies a role change or deactivation to the token already in use', async () => {
      const id = await account('zzsecfinance', 'FINANCE');
      await session('zzsecfinance');
      expect((await call('get', '/audit', 'zzsecfinance')).status).toBe(200);
      const employee = await prisma.role.findUniqueOrThrow({ where: { name: 'EMPLOYEE' } });
      await prisma.user.update({ where: { id }, data: { roleId: employee.id } });
      expect((await call('get', '/audit', 'zzsecfinance')).status).toBe(403);
      await prisma.user.update({ where: { id }, data: { isActive: false } });
      expect((await call('get', '/notifications', 'zzsecfinance')).status).toBe(401);
    });

    it('ends other sessions when a password is changed or reset', async () => {
      const id = await account('zzsecpass', 'EMPLOYEE');
      // A session refreshes while nothing has changed, and hands out its next token
      const first = String((await refresh(await session('zzsecpass'))).headers['set-cookie']).split(';')[0];
      expect(first).toContain('refreshToken=');
      expect((await call('put', '/users/me/profile', 'zzsecpass', { password: 'Changed@123', currentPassword: 'Test@1234' })).status).toBe(200);
      expect((await refresh(first)).status).toBe(401);
      const second = String((await signIn('zzsecpass', 'Changed@123')).headers['set-cookie']).split(';')[0];
      expect((await call('put', `/users/${id}`, 'admin', { password: 'Reset@12345' })).status).toBe(200);
      expect((await refresh(second)).status).toBe(401);
    });
  });

  describe('recurring schedules', () => {
    it('does not let Finance approve their own schedule from the schedule list', async () => {
      const id = await schedule('fin1');
      expect((await call('post', `/recurring/${id}/approve`, 'fin1')).status).toBe(403);
      expect((await prisma.recurringTransaction.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING_FINANCE');
      expect((await call('post', `/recurring/${id}/approve`, 'fin2')).status).toBe(201);
      expect((await prisma.recurringTransaction.findUniqueOrThrow({ where: { id } })).approvedById).toBe(ids.fin2);
    });

    it("leaves a manager step to the requester's own manager", async () => {
      const id = await schedule('emp1');
      const mine = (await prisma.user.findUniqueOrThrow({ where: { id: ids.emp1 } })).managerId;
      const [own, other] = mine === ids.mgr1 ? ['mgr1', 'mgr2'] : ['mgr2', 'mgr1'];
      expect((await call('post', `/recurring/${id}/approve`, other)).status).toBe(403);
      expect((await call('post', `/recurring/${id}/reject`, other)).status).toBe(403);
      expect((await call('post', `/recurring/${id}/approve`, own)).status).toBe(201);
      expect((await call('post', `/recurring/${id}/reject`, 'fin1')).status).toBe(201);
      expect((await prisma.recurringTransaction.findUniqueOrThrow({ where: { id } })).status).toBe('REJECTED');
    });

    it('keeps the approved terms when a paused schedule resumes', async () => {
      const row = await dueSchedule(ids.emp1);
      await call('post', `/recurring/${row.id}/pause`, 'emp1');
      expect((await call('post', `/recurring/${row.id}/resume`, 'emp1', { frequency: 'daily' })).status).toBe(400);
      expect((await call('post', `/recurring/${row.id}/resume`, 'emp1', { amount: 9999 })).status).toBe(400);
      expect((await call('post', `/recurring/${row.id}/resume`, 'emp1', { next_run: dayFromToday(-40) })).status).toBe(400);
      // A date that passed while paused moves up to today, so paused periods are not posted
      await prisma.recurringTransaction.update({ where: { id: row.id }, data: { nextRunDate: new Date(dayFromToday(-90)) } });
      expect((await call('post', `/recurring/${row.id}/resume`, 'emp1', {})).status).toBe(201);
      const after = await prisma.recurringTransaction.findUniqueOrThrow({ where: { id: row.id } });
      expect(after.nextRunDate.toISOString().slice(0, 10)).toBe(today());
      expect(after.frequency).toBe('monthly');
    });

    it('posts nothing for a deactivated person, and posts a due run once', async () => {
      const gone = await account('zzsecgone', 'EMPLOYEE', { isActive: false });
      const theirs = await dueSchedule(gone);
      const mine = await dueSchedule(ids.emp1);
      const service = app.get(RecurringService);
      await Promise.all([service.processDue(), service.processDue()]);
      expect(await prisma.transaction.count({ where: { recurringTransactionId: theirs.id } })).toBe(0);
      expect(await prisma.transaction.count({ where: { recurringTransactionId: mine.id } })).toBe(1);
    });
  });

  describe('transactions', () => {
    it('does not change an expense while it is being submitted', async () => {
      const made = await call('post', '/transactions', 'admin', expense());
      const id = made.body.data.id as number;
      const service = app.get(TransactionsService) as any;
      const real = service.enforceSpendPolicy.bind(service);
      let reached!: () => void;
      const checking = new Promise<void>((resolve) => { reached = resolve; });
      jest.spyOn(service, 'enforceSpendPolicy').mockImplementationOnce((async (...args: unknown[]) => { try { await real(...args); } finally { reached(); } await new Promise((r) => setTimeout(r, 700)); }) as never);
      const submitting = call('post', `/transactions/${id}/submit`, 'admin').then((r) => r);
      await checking;
      const edit = await call('put', `/transactions/${id}`, 'admin', { amount: 999999 });
      expect((await submitting).status).toBe(200);
      expect(edit.status).toBe(400);
      expect(Number((await prisma.transaction.findUniqueOrThrow({ where: { id } })).amount)).toBe(100);
    });
  });

  describe('budgets and reports', () => {
    const plan = async (fy: number, lineCount: number) => {
      const made = await call('post', '/budgets/plans', 'admin', { fy, name: `ZZsec plan ${fy}` });
      expect(made.body).toMatchObject({ success: true });
      const planId = (await prisma.budgetPlan.findUniqueOrThrow({ where: { fy } })).id;
      const lines: number[] = [];
      for (let i = 0; i < lineCount; i++) {
        const r = await call('post', '/budgets/lines', 'admin', { plan_id: planId, cost_object: 'RESERVE', owner_id: ids.admin, periods: monthly(100) });
        expect(r.status).toBe(201);
        lines.push(r.body.data.id);
      }
      return lines;
    };
    const total = async (lineId: number) => (await prisma.budgetLinePeriod.findMany({ where: { lineId } })).reduce((a, p) => a + Number(p.amount), 0);

    it('still knows who submitted a plan after they change their name', async () => {
      await plan(2091, 1);
      await account('zzsecplanner', 'FINANCE');
      await session('zzsecplanner');
      expect((await call('post', '/budgets/plans/2091/submit', 'zzsecplanner')).status).toBe(201);
      expect((await call('put', '/users/me/profile', 'zzsecplanner', { username: 'zzsecrenamed' })).status).toBe(200);
      expect((await call('post', '/budgets/plans/2091/decision', 'zzsecplanner', { decision: 'approve' })).status).toBe(403);
    });

    it('keeps a manager to their own lines, and applies a budget change once', async () => {
      const [line] = await plan(2092, 1);
      const asked = await call('post', '/budgets/changes', 'admin', { kind: 'REVISION', to_line_id: line, amount: 10, reason: 'ZZsec increase' });
      expect(asked.status).toBe(201);

      // Month close leaves reserves out, so make it an ordinary department line
      await prisma.budgetLine.update({ where: { id: line }, data: { costObject: 'DEPARTMENT', departmentId: (await prisma.department.findFirstOrThrow()).id } });
      const everything = await call('get', '/budgets/close?year=2092&month=5', 'admin');
      expect(everything.body.data.lines.map((l: any) => l.line_id)).toContain(line);

      await account('zzsecmanager', 'MANAGER');
      await session('zzsecmanager');
      const close = await call('get', '/budgets/close?year=2092&month=5', 'zzsecmanager');
      expect(close.body.data.lines).toEqual([]);
      const changes = await call('get', '/budgets/changes', 'zzsecmanager');
      expect(changes.body.data.rows.map((r: any) => r.id)).not.toContain(asked.body.data.id);
      expect((await call('post', '/budgets/close/variance', 'zzsecmanager', { line_id: line, year: 2092, month: 5, reason_code: 'TIMING' })).status).toBe(403);

      const decide = (who: string) => call('post', `/budgets/changes/${asked.body.data.id}/decision`, who, { decision: 'approve' });
      const results = await Promise.all([decide('fin1'), decide('fin2')]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await total(line)).toBe(1210);
    });

    it('never lists deleted records, whatever status is asked for', async () => {
      const made = await call('post', '/transactions', 'emp1', expense({ description: 'ZZsec deleted one' }));
      await prisma.transaction.update({ where: { id: made.body.data.id }, data: { status: 'DELETED' } });
      for (const status of ['constructor', '__proto__', 'toString']) {
        const r = await call('get', `/reporting/generate?type=transaction-ledger&status=${status}`, 'admin');
        expect(r.status).toBe(200);
        expect(JSON.stringify(r.body)).not.toContain('ZZsec deleted one');
      }
    });
  });

  describe('second audit', () => {
    const ocr = (content: Buffer, filename: string) => request(app.getHttpServer()).post('/api/v1/receipts/ocr').set('Authorization', `Bearer ${tokens.emp1}`).attach('receipt', content, { filename, contentType: 'image/png' });

    it('survives a picture that cannot be read', async () => {
      // One is not a picture at all; the other starts like a PNG and then is rubbish
      for (const content of [Buffer.from('not a picture'), Buffer.concat([PNG.subarray(0, 8), Buffer.from('rubbish rubbish rubbish')])]) {
        const r = await ocr(content, 'x.png');
        expect(r.status).toBe(201);
        expect(r.body.data.amount).toBeNull();
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
      expect((await request(app.getHttpServer()).get('/health')).status).toBe(200);
    }, 60000);

    it('does not tell strangers why the database is down', async () => {
      const spy = jest.spyOn(prisma, '$queryRaw').mockImplementationOnce((() => Promise.reject(new Error('password authentication failed for user "ems" at db-host:5432'))) as never);
      const r = await request(app.getHttpServer()).get('/health');
      spy.mockRestore();
      expect(JSON.stringify(r.body)).not.toContain('db-host');
    });

    it('counts every spelling of one account together', async () => {
      const id = await account('zzsecalias', 'EMPLOYEE');
      const spellings = ['zzsecalias', `NT${10000 + id}`, `NT0${10000 + id}`, `nt00${10000 + id}`];
      for (let i = 0; i < 10; i++) expect((await signIn(spellings[i % 4], 'wrong', '198.51.100.20')).status).toBe(401);
      for (const name of spellings) expect((await signIn(name, 'wrong', '198.51.100.20')).status).toBe(429);
    });

    it('limits one account even when every try claims a new address', async () => {
      await account('zzsecspoof', 'EMPLOYEE');
      for (let i = 0; i < 30; i++) expect((await signIn('zzsecspoof', 'wrong', `203.0.113.${i + 1}`)).status).toBe(401);
      expect((await signIn('zzsecspoof', 'wrong', '203.0.113.200')).status).toBe(429);
    });

    it('never moves a resumed schedule earlier than the run it was due', async () => {
      const row = await dueSchedule(ids.emp1);
      await prisma.recurringTransaction.update({ where: { id: row.id }, data: { nextRunDate: new Date(dayFromToday(20)) } });
      await call('post', `/recurring/${row.id}/pause`, 'emp1');
      expect((await call('post', `/recurring/${row.id}/resume`, 'emp1', { next_run: today() })).status).toBe(400);
      expect((await call('post', `/recurring/${row.id}/resume`, 'emp1', {})).status).toBe(201);
      expect((await prisma.recurringTransaction.findUniqueOrThrow({ where: { id: row.id } })).nextRunDate.toISOString().slice(0, 10)).toBe(dayFromToday(20));
    });
  });

  describe('requests that arrive together', () => {
    const both = async (a: Promise<Res>, b: Promise<Res>) => (await Promise.all([a, b])).map((r) => (r.status < 300 ? 'done' : String(r.status))).sort();
    const bill = async (number: string) => {
      const client = await prisma.client.findFirstOrThrow({ where: { isSystem: false } });
      return (await prisma.invoice.create({ data: { number, clientId: client.id, invoiceDate: businessToday(), dueDate: businessToday(), total: 100, taxable: 100, status: 'ISSUED' } })).id;
    };
    const decided = async (status: string, extra: Record<string, unknown> = {}) => {
      const made = await call('post', '/transactions', 'emp1', expense());
      const id = made.body.data.id as number;
      await prisma.transaction.update({ where: { id }, data: { status, ...extra } });
      return id;
    };

    it('records a full payment once', async () => {
      for (let round = 1; round <= 3; round++) {
        const id = await bill(`ZZSEC-P${round}`);
        const pay = (who: string) => call('post', `/invoices/${id}/payments`, who, { amount: 100, paid_on: today() });
        expect(await both(pay('fin1'), pay('fin2'))).toEqual(['409', 'done']);
        expect(await prisma.invoicePayment.count({ where: { invoiceId: id } })).toBe(1);
      }
    });

    it('never leaves a cancelled invoice holding a payment', async () => {
      for (let round = 1; round <= 3; round++) {
        const id = await bill(`ZZSEC-C${round}`);
        await both(call('post', `/invoices/${id}/payments`, 'fin1', { amount: 100, paid_on: today() }), call('post', `/invoices/${id}/cancel`, 'fin2', { reason: 'ZZsec race' }));
        const after = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: { payments: true } });
        expect(after.status === 'CANCELLED' ? after.payments.length : after.status).toBe(after.status === 'CANCELLED' ? 0 : 'PAID');
      }
    });

    it('voids a record once, and never leaves a voided record paid back', async () => {
      for (let round = 0; round < 3; round++) {
        const id = await decided('APPROVED', { needsReimbursement: true });
        const voided = () => call('post', `/transactions/${id}/void`, 'fin1', { reason: 'ZZsec void reason' });
        expect(await both(voided(), voided())).toEqual([expect.stringMatching(/^4/), 'done']);
        const other = await decided('APPROVED', { needsReimbursement: true });
        await both(call('post', `/transactions/${other}/void`, 'fin1', { reason: 'ZZsec void reason' }), call('post', `/transactions/${other}/reimburse`, 'fin2', { status: 'PAID' }));
        const t = await prisma.transaction.findUniqueOrThrow({ where: { id: other } });
        expect(t.status === 'VOIDED' && t.reimbursementStatus === 'PAID').toBe(false);
      }
    });

    it('decides a waiting expense once: approved or sent back, not both', async () => {
      for (let round = 0; round < 3; round++) {
        const id = await decided('PENDING_FINANCE');
        const req = await prisma.approvalRequest.create({ data: { transactionId: id, approverId: ids.fin1, levelNum: 1, status: 'PENDING' } });
        await both(call('post', `/approvals/${req.id}/approve`, 'fin1', {}), call('post', `/approvals/${req.id}/send-back`, 'fin2', { comments: 'ZZsec send it back' }));
        const t = await prisma.transaction.findUniqueOrThrow({ where: { id } });
        const r = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: req.id } });
        expect(t.status).toBe(r.status);
      }
    });

    it('cannot delete an expense while it is being submitted', async () => {
      for (const bulk of [false, true]) {
        const id = (await call('post', '/transactions', 'admin', expense())).body.data.id as number;
        const service = app.get(TransactionsService) as any;
        const real = service.enforceSpendPolicy.bind(service);
        let reached!: () => void;
        const checking = new Promise<void>((resolve) => { reached = resolve; });
        jest.spyOn(service, 'enforceSpendPolicy').mockImplementationOnce((async (...args: unknown[]) => { try { await real(...args); } finally { reached(); } await new Promise((r) => setTimeout(r, 700)); }) as never);
        const submitting = call('post', `/transactions/${id}/submit`, 'admin').then((r) => r);
        await checking;
        const removed = bulk ? await call('post', '/transactions/bulk-delete', 'admin', { ids: [id] }) : await call('delete', `/transactions/${id}`, 'admin');
        expect((await submitting).status).toBe(200);
        expect(removed.status).toBe(400);
        expect((await prisma.transaction.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING_FINANCE');
      }
    });

    it('asks which records to delete', async () => {
      await account('zzsecbulk', 'EMPLOYEE');
      await session('zzsecbulk');
      const mine = await call('post', '/transactions', 'zzsecbulk', expense());
      expect((await call('post', '/transactions/bulk-delete', 'zzsecbulk', {})).status).toBe(400);
      expect((await prisma.transaction.findUniqueOrThrow({ where: { id: mine.body.data.id } })).status).toBe('DRAFT');
      await prisma.transaction.delete({ where: { id: mine.body.data.id } });
      await prisma.notification.deleteMany({ where: { user: { loginName: 'zzsecbulk' } } });
    });
  });

  describe('who sees what, and closed months', () => {
    it('keeps someone set to their own records to their own records', async () => {
      const boss = await account('zzsecboss', 'MANAGER');
      await account('zzsecreport', 'EMPLOYEE', { managerId: boss });
      await session('zzsecboss');
      await session('zzsecreport');
      const theirs = await call('post', '/transactions', 'zzsecreport', expense({ description: 'ZZsec team expense' }));
      await prisma.transaction.update({ where: { id: theirs.body.data.id }, data: { status: 'APPROVED' } });
      const ledger = async () => JSON.stringify((await call('get', '/reporting/generate?type=transaction-ledger', 'zzsecboss')).body);
      expect(await ledger()).toContain('ZZsec team expense');
      // 'Own Records' is what the permissions dialog used to send
      expect((await call('put', `/users/${boss}/permissions`, 'admin', { data_scope: 'Own Records' })).body.data.data_scope).toBe('Self');
      expect(await ledger()).not.toContain('ZZsec team expense');
      expect((await call('put', `/users/${boss}/permissions`, 'admin', { data_scope: 'Everything' })).status).toBe(400);
    });

    it("keeps other people's drafts off the Home page", async () => {
      await call('post', '/transactions', 'emp1', expense({ description: 'ZZsec unsubmitted', dateRecorded: today() }));
      expect(JSON.stringify((await call('get', '/dashboard/overview', 'admin')).body)).not.toContain('ZZsec unsubmitted');
      expect(JSON.stringify((await call('get', '/dashboard/overview', 'emp1')).body)).toContain('ZZsec unsubmitted');
    });

    it('hides personal details in the audit log from Finance', async () => {
      const id = await account('zzsecperson', 'EMPLOYEE');
      expect((await call('put', `/users/${id}`, 'admin', { contact_no: '+91 98765 43210', address: 'ZZsec private lane' })).status).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const seen = async (who: string) => JSON.stringify((await call('get', `/audit?table=users&tableName=users&limit=20`, who)).body);
      expect(await seen('admin')).toContain('ZZsec private lane');
      expect(await seen('fin1')).not.toContain('ZZsec private lane');
      expect(await seen('fin1')).not.toContain('98765 43210');
    });

    it('does not give employees product costs or budget figures', async () => {
      const product = await prisma.product.findFirstOrThrow({ where: { isActive: true } });
      const was = product.standardCost;
      await prisma.product.update({ where: { id: product.id }, data: { standardCost: 4321 } });
      const list = await call('get', '/products', 'emp1');
      await prisma.product.update({ where: { id: product.id }, data: { standardCost: was } });
      expect(JSON.stringify(list.body)).not.toContain('4321');
      const mine = await call('post', '/transactions', 'emp1', expense());
      await prisma.transaction.update({ where: { id: mine.body.data.id }, data: { status: 'APPROVED' } });
      for (const kind of ['project-burn', 'product-burn']) {
        const rows = (await call('get', `/dashboard/analytics/${kind}`, 'emp1')).body.data as any[];
        expect(rows.every((r) => r.budget === 0 && r.pct === null)).toBe(true);
      }
    });

    it("keeps a manager's budget check to expenses that are theirs to see", async () => {
      const mine = await call('post', '/transactions', 'emp1', expense());
      await account('zzsecoutsider', 'MANAGER');
      await session('zzsecoutsider');
      const boss = await account('zzsecbossb', 'MANAGER');
      const worker = await account('zzsecworker', 'EMPLOYEE', { managerId: boss });
      await prisma.transaction.update({ where: { id: mine.body.data.id }, data: { userId: worker } });
      const r = await call('get', `/budgets/impact?ids=${mine.body.data.id}`, 'zzsecoutsider');
      expect(r.status).toBe(200);
      expect(r.body.data[mine.body.data.id]).toBeUndefined();
    });

    it('leaves closed months alone when an approved baseline is pushed into the budget', async () => {
      const budgets = app.get(BudgetsService);
      const settings = await budgets.getSettings();
      const now = businessToday();
      const plan = await prisma.budgetPlan.findUniqueOrThrow({ where: { fy: budgets.fyOf(now, settings.fyStartMonth) } });
      // Its own project, so no hand-made budget line stands in the way of the push
      const model = await prisma.project.findFirstOrThrow({ where: { id: projectId } });
      const own = await prisma.project.create({ data: { name: 'ZZsec closed month project', clientId: model.clientId, start_date: now, end_date: now } });
      const when = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
      const baseline = await prisma.estimateBaseline.create({ data: { projectId: own.id, direct: 0, contingency: 123456, warranty: 0, total: 123456, contingencyPct: 0, warrantyPct: 0, lines: [], proposedByName: 'ZZsec' } });
      const lines = () => prisma.budgetLine.findMany({ where: { planId: plan.id }, include: { periods: { orderBy: [{ year: 'asc' }, { month: 'asc' }] } }, orderBy: { id: 'asc' } });
      await prisma.budgetPlan.update({ where: { id: plan.id }, data: { status: 'DRAFT' } });
      await prisma.periodLock.create({ data: when });
      try {
        const before = JSON.stringify(await lines());
        const r = await call('post', `/budgets/baselines/${baseline.id}/approve`, 'fin1');
        expect(r.status).toBe(400);
        expect(JSON.stringify(await lines())).toBe(before);
        expect((await prisma.estimateBaseline.findUniqueOrThrow({ where: { id: baseline.id } })).status).toBe('PROPOSED');
      } finally {
        await prisma.periodLock.delete({ where: { year_month: when } });
        await prisma.budgetPlan.update({ where: { id: plan.id }, data: { status: plan.status } });
        await prisma.estimateBaseline.delete({ where: { id: baseline.id } });
        await prisma.budgetLinePeriod.deleteMany({ where: { line: { projectId: own.id } } });
        await prisma.budgetLine.deleteMany({ where: { projectId: own.id } });
        await prisma.project.delete({ where: { id: own.id } });
      }
    });
  });
});
