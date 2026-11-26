import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { today as businessToday } from './../src/common/helpers/dates';

// What an expense must say before it is submitted, and what happens to a split when the amount changes.
// Test data starts with "ZZ " in the description and is removed before and after the run.
type Res = { status: number; body: any };

describe('Expense rules for budgets (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string;
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
    await prisma.transactionSplit.deleteMany({ where: { transaction: { description: { startsWith: 'ZZ ' } } } });
    await prisma.transaction.deleteMany({ where: { description: { startsWith: 'ZZ ' } } });
  };

  const draft = async (extra: Record<string, unknown>) => {
    const r = await call('post', '/transactions', admin, { type: 'expense', amount: 1000, dateRecorded: today(), description: 'ZZ expense', paymentMethod: 'cash', ...extra });
    if (r.status !== 201) throw new Error(`Setup expense failed (${r.status}): ${JSON.stringify(r.body)}`);
    return r.body.data.id as number;
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
    const categories = await prisma.category.findMany({ where: { isActive: true, type: 'expense' }, take: 2, orderBy: { id: 'asc' } });
    categoryA = categories[0].id;
    categoryB = categories[1].id;
    projectId = (await prisma.project.findFirstOrThrow()).id;
  }, 60000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('submitting an expense', () => {
    it('asks for a category', async () => {
      const id = await draft({ contextType: 'project', projectId });
      const r = await call('post', `/transactions/${id}/submit`, admin);
      expect(r.status).toBe(400);
      expect(message(r)).toMatch(/category/i);
    });

    it('asks for the project, product or department it is charged to', async () => {
      const id = await draft({ categoryId: categoryA, contextType: 'project' });
      const r = await call('post', `/transactions/${id}/submit`, admin);
      expect(r.status).toBe(400);
      expect(message(r)).toMatch(/charged to/i);
    });

    it('asks for a department when it is an overhead', async () => {
      const id = await draft({ categoryId: categoryA, contextType: 'overhead' });
      const r = await call('post', `/transactions/${id}/submit`, admin);
      expect(r.status).toBe(400);
      expect(message(r)).toMatch(/department/i);
    });
  });

  describe('splitting an expense', () => {
    it('refuses a split that has no category or no amount', async () => {
      const id = await draft({ categoryId: categoryA, contextType: 'project', projectId });
      const noCategory = await call('post', `/transactions/${id}/split`, admin, { splits: [{ amount: 400 }, { categoryId: categoryB, amount: 600 }] });
      expect(noCategory.status).toBe(400);
      expect(message(noCategory)).toMatch(/category/i);
      const noAmount = await call('post', `/transactions/${id}/split`, admin, { splits: [{ categoryId: categoryA, amount: 0 }, { categoryId: categoryB, amount: 1000 }] });
      expect(noAmount.status).toBe(400);
    });

    it('drops the split when the amount changes, so budget lines never see stale parts', async () => {
      const id = await draft({ categoryId: categoryA, contextType: 'project', projectId });
      const split = await call('post', `/transactions/${id}/split`, admin, { splits: [{ categoryId: categoryA, amount: 400 }, { categoryId: categoryB, amount: 600 }] });
      expect(split.status).toBe(201);
      expect((await prisma.transaction.findUniqueOrThrow({ where: { id } })).isSplit).toBe(true);

      const changed = await call('put', `/transactions/${id}`, admin, { type: 'expense', amount: 1500, dateRecorded: today(), categoryId: categoryA, contextType: 'project', projectId, description: 'ZZ expense' });
      expect(changed.status).toBe(200);
      expect((await prisma.transaction.findUniqueOrThrow({ where: { id } })).isSplit).toBe(false);
      expect(await prisma.transactionSplit.count({ where: { transactionId: id } })).toBe(0);
    });

    it('keeps the split when the amount is unchanged', async () => {
      const id = await draft({ categoryId: categoryA, contextType: 'project', projectId });
      await call('post', `/transactions/${id}/split`, admin, { splits: [{ categoryId: categoryA, amount: 400 }, { categoryId: categoryB, amount: 600 }] });
      const same = await call('put', `/transactions/${id}`, admin, { type: 'expense', amount: 1000, dateRecorded: today(), categoryId: categoryA, contextType: 'project', projectId, description: 'ZZ expense edited' });
      expect(same.status).toBe(200);
      expect(await prisma.transactionSplit.count({ where: { transactionId: id } })).toBe(2);
    });
  });
});
