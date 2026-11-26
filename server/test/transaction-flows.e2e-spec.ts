import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { today as businessToday } from './../src/common/helpers/dates';

// Rules of the Transactions group: what can be changed, deleted, split, voided and approved, and who can see a record's notes.
// Test data starts with "ZZ " in the description and is removed before and after the run.
type Res = { status: number; body: any };

describe('Transaction rules (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string;
  let finance: string;
  let employee: string;
  let categoryA: number;
  let categoryB: number;
  let projectId: number;

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
  const message = (r: Res) => r.body?.error?.message ?? r.body?.message ?? '';
  const login = async (username: string, password: string) => {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password });
    if (!r.body?.data?.accessToken) throw new Error(`Login failed for ${username} (${r.status})`);
    return r.body.data.accessToken as string;
  };
  const today = () => businessToday().toISOString().slice(0, 10);

  const cleanup = async () => {
    await prisma.transactionNote.deleteMany({ where: { transaction: { description: { startsWith: 'ZZ ' } } } });
    await prisma.approvalRequest.deleteMany({ where: { transaction: { description: { startsWith: 'ZZ ' } } } });
    await prisma.transactionSplit.deleteMany({ where: { transaction: { description: { startsWith: 'ZZ ' } } } });
    await prisma.transaction.deleteMany({ where: { description: { startsWith: 'ZZ ' } } });
  };

  const draft = async (token: string, extra: Record<string, unknown> = {}) => {
    const r = await call('post', '/transactions', token, { type: 'expense', amount: 1000, dateRecorded: today(), description: 'ZZ expense', paymentMethod: 'cash', categoryId: categoryA, contextType: 'project', projectId, ...extra });
    if (r.status !== 201) throw new Error(`Setup expense failed (${r.status}): ${JSON.stringify(r.body)}`);
    return r.body.data.id as number;
  };
  const setStatus = (id: number, status: string, extra: Record<string, unknown> = {}) => prisma.transaction.update({ where: { id }, data: { status, ...extra } });

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
    const categories = await prisma.category.findMany({ where: { isActive: true, type: 'expense' }, take: 2, orderBy: { id: 'asc' } });
    categoryA = categories[0].id;
    categoryB = categories[1].id;
    projectId = (await prisma.project.findFirstOrThrow()).id;
  }, 60000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('changing a record', () => {
    it('keeps everything else when only the receipt changes', async () => {
      const id = await draft(admin, { amount: 1180, gstRate: 18, gstIncluded: true, description: 'ZZ receipt only' });
      const up = await request(app.getHttpServer()).post('/api/v1/receipts/upload').set('Authorization', `Bearer ${admin}`).attach('receipt', Buffer.from('%PDF-1.4 test'), 'receipt-1.pdf');
      const name = up.body.data.filename as string;
      const r = await call('put', `/transactions/${id}`, admin, { receiptPath: name });
      expect(r.status).toBe(200);
      const t = await prisma.transaction.findUniqueOrThrow({ where: { id } });
      expect(t.receiptPath).toBe(name);
      expect(Number(t.totalAmount)).toBe(1180);
      expect(Number(t.amount)).toBe(1180);
      expect(t.categoryId).toBe(categoryA);
      expect(t.projectId).toBe(projectId);
      expect(t.description).toBe('ZZ receipt only');
    });

    it('says not found for a record that is not yours', async () => {
      const id = await draft(admin);
      const r = await call('put', `/transactions/${id}`, employee, { description: 'ZZ taken' });
      expect(r.status).toBe(404);
    });

    it('refuses an edit once it is in approval', async () => {
      const id = await draft(admin);
      await setStatus(id, 'PENDING_FINANCE');
      const r = await call('put', `/transactions/${id}`, admin, { description: 'ZZ late edit' });
      expect(r.status).toBe(400);
    });
  });

  describe('deleting', () => {
    it('only lets a draft or sent-back record go, one at a time or in bulk', async () => {
      for (const status of ['PENDING_MANAGER', 'PENDING_FINANCE', 'APPROVED', 'REJECTED', 'VOIDED']) {
        const id = await draft(admin);
        await setStatus(id, status);
        expect((await call('delete', `/transactions/${id}`, admin)).status).toBe(400);
        expect((await call('post', '/transactions/bulk-delete', admin, { ids: [id] })).status).toBe(400);
      }
      const ok = await draft(admin);
      expect((await call('delete', `/transactions/${ok}`, admin)).status).toBe(200);
      const sentBack = await draft(admin);
      await setStatus(sentBack, 'SENT_BACK');
      expect((await call('post', '/transactions/bulk-delete', admin, { ids: [sentBack] })).status).toBe(200);
    });

    it('says not found for one that is gone', async () => {
      const id = await draft(admin);
      await call('delete', `/transactions/${id}`, admin);
      expect((await call('delete', `/transactions/${id}`, admin)).status).toBe(404);
    });
  });

  describe('splitting', () => {
    it('only a draft or sent-back record can be split, into real categories', async () => {
      const id = await draft(admin);
      const parts = [{ categoryId: categoryA, amount: 400 }, { categoryId: categoryB, amount: 600 }];
      await setStatus(id, 'PENDING_FINANCE');
      expect((await call('post', `/transactions/${id}/split`, admin, { splits: parts })).status).toBe(400);
      await setStatus(id, 'DRAFT');
      expect((await call('post', `/transactions/${id}/split`, admin, { splits: [{ categoryId: 99999999, amount: 400 }, { categoryId: categoryB, amount: 600 }] })).status).toBe(400);
      expect((await call('post', `/transactions/${id}/split`, admin, { splits: parts })).status).toBe(201);
    });
  });

  describe('notes', () => {
    it('are private to the owner and to Managers, Finance and Admin', async () => {
      const id = await draft(admin, { description: 'ZZ with notes' });
      expect((await call('post', `/transactions/${id}/notes`, admin, { note: 'ZZ first' })).status).toBe(201);
      expect((await call('get', `/transactions/${id}/notes`, employee)).status).toBe(403);
      expect((await call('post', `/transactions/${id}/notes`, employee, { note: 'ZZ nosy' })).status).toBe(403);
      const seen = await call('get', `/transactions/${id}/notes`, finance);
      expect(seen.status).toBe(200);
      expect(seen.body.data).toHaveLength(1);
    });
  });

  describe('reimbursement and voiding', () => {
    it('reimburses only an approved expense', async () => {
      const id = await draft(admin, { needsReimbursement: true });
      const early = await call('post', `/transactions/${id}/reimburse`, finance, { status: 'PAID' });
      expect(early.status).toBe(400);
      await setStatus(id, 'APPROVED');
      expect((await call('post', `/transactions/${id}/reimburse`, finance, { status: 'PAID', reference: 'ZZ-1' })).status).toBe(200);
    });

    it('voids only with a reason, and not once it has been paid out', async () => {
      const id = await draft(admin, { needsReimbursement: true });
      await setStatus(id, 'APPROVED');
      expect((await call('post', `/transactions/${id}/void`, finance, {})).status).toBe(400);
      expect((await call('post', `/transactions/${id}/void`, finance, { reason: '  ' })).status).toBe(400);
      await call('post', `/transactions/${id}/reimburse`, finance, { status: 'PAID' });
      expect((await call('post', `/transactions/${id}/void`, finance, { reason: 'ZZ paid already' })).status).toBe(400);
      const free = await draft(admin);
      await setStatus(free, 'APPROVED');
      expect((await call('post', `/transactions/${free}/void`, finance, { reason: 'ZZ duplicate entry' })).status).toBe(200);
    });
  });

  describe('decisions in the approval queue', () => {
    const queue = async (userId: number, status: string) => {
      const id = await draft(admin);
      await setStatus(id, status);
      const req = await prisma.approvalRequest.create({ data: { transactionId: id, approverId: userId, levelNum: 1, status: 'PENDING' } });
      return { id, requestId: req.id };
    };

    it('asks for a reason to reject or send back', async () => {
      const adminUser = await prisma.user.findFirstOrThrow({ where: { username: 'admin' } });
      const finUser = await prisma.user.findFirstOrThrow({ where: { username: 'fin1' } });
      const { requestId } = await queue(finUser.id, 'PENDING_FINANCE');
      void adminUser;
      expect((await call('post', `/approvals/${requestId}/reject`, finance, {})).status).toBe(400);
      expect((await call('post', `/approvals/${requestId}/send-back`, finance, { comments: ' ' })).status).toBe(400);
    });

    it('does not approve a record that is not waiting for anyone', async () => {
      const finUser = await prisma.user.findFirstOrThrow({ where: { username: 'fin1' } });
      const { id, requestId } = await queue(finUser.id, 'DELETED');
      const r = await call('post', `/approvals/${requestId}/approve`, finance, {});
      expect(r.status).toBe(400);
      expect((await prisma.transaction.findUniqueOrThrow({ where: { id } })).status).toBe('DELETED');
    });

    it('does not approve spend into a closed month', async () => {
      const finUser = await prisma.user.findFirstOrThrow({ where: { username: 'fin1' } });
      const id = await draft(admin, { dateRecorded: '2019-03-10' });
      await setStatus(id, 'PENDING_FINANCE');
      const req = await prisma.approvalRequest.create({ data: { transactionId: id, approverId: finUser.id, levelNum: 1, status: 'PENDING' } });
      await prisma.periodLock.create({ data: { year: 2019, month: 3, lockedByName: 'ZZ test' } });
      try {
        const r = await call('post', `/approvals/${req.id}/approve`, finance, {});
        expect(r.status).toBe(409);
        expect(message(r)).toMatch(/closed/i);
      } finally {
        await prisma.periodLock.delete({ where: { year_month: { year: 2019, month: 3 } } }).catch(() => undefined);
      }
    });
  });

  describe('export', () => {
    it('follows the search and names the order and the cost object', async () => {
      await draft(admin, { description: 'ZZ exported row' });
      const r = await request(app.getHttpServer()).get('/api/v1/transactions/export?search=ZZ%20exported').set('Authorization', `Bearer ${admin}`);
      expect(r.status).toBe(200);
      const lines = r.text.trim().split(/\r?\n/);
      expect(lines[0]).toContain('Order');
      expect(lines[0]).toContain('Charged To');
      expect(lines).toHaveLength(2);
    });
  });
});
