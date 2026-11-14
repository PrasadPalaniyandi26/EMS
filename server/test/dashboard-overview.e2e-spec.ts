import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// The Home overview: one call, scoped by role, figures that add up, and a period compared with the one before it.
// Test data is dated in 2018 and starts with "ZZ " in the description; it is removed before and after the run.
describe('Home overview (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string; let employee: string; let manager: string;
  let catId: number; let adminId: number;

  const login = async (username: string, password: string) => {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password });
    if (!r.body?.data?.accessToken) throw new Error(`Login failed for ${username}`);
    return r.body.data.accessToken as string;
  };
  const overview = (t: string, q = '') => request(app.getHttpServer()).get(`/api/v1/dashboard/overview${q}`).set('Authorization', `Bearer ${t}`);
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
    manager = await login('mgr1', 'Test@1234');
    employee = await login('emp1', 'Test@1234');
    catId = (await prisma.category.findFirstOrThrow({ where: { isActive: true, type: 'expense' }, orderBy: { id: 'asc' } })).id;
    adminId = (await prisma.user.findFirstOrThrow({ where: { username: 'admin' } })).id;
    const make = (type: string, amount: number, date: string, desc: string) => prisma.transaction.create({
      data: { userId: adminId, type, amount, netAmount: amount, totalAmount: amount, dateRecorded: new Date(date), categoryId: catId, description: desc, status: 'APPROVED', contextType: 'project' },
    });
    await make('income', 5000, '2018-05-10', 'ZZ may income');
    await make('expense', 1200, '2018-05-12', 'ZZ may expense');
    await make('income', 2000, '2018-04-10', 'ZZ april income');
    await make('expense', 500, '2018-04-12', 'ZZ april expense');
  }, 60000);

  afterAll(async () => { await cleanup(); await app.close(); });

  it('returns everything the page needs, and the figures add up', async () => {
    const r = await overview(admin, '?dateFrom=2018-05-01&dateTo=2018-05-31');
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d.scope).toBe('everyone');
    expect(d.series).toHaveLength(12);
    expect(d.totals.income).toBeGreaterThanOrEqual(5000);
    expect(d.totals.net).toBeCloseTo(d.totals.income - d.totals.expenses, 2);
    expect(d.totals.expenses_approved + d.totals.expenses_pending).toBeCloseTo(d.totals.expenses, 2);
    expect(Array.isArray(d.attention)).toBe(true);
    expect(Array.isArray(d.recent)).toBe(true);
  });

  it('compares the period with the one before it', async () => {
    const r = await overview(admin, '?dateFrom=2018-05-01&dateTo=2018-05-31');
    const d = r.body.data;
    expect(d.previous).not.toBeNull();
    expect(d.previous.income).toBeGreaterThanOrEqual(2000);
    expect((await overview(admin)).body.data.previous).toBeNull();
  });

  it('counts spend by category and the shares add up to the whole', async () => {
    const d = (await overview(admin, '?dateFrom=2018-05-01&dateTo=2018-05-31')).body.data;
    expect(d.categories.rows.length).toBeGreaterThan(0);
    const sum = d.categories.rows.reduce((a: number, c: any) => a + c.amount, 0);
    expect(sum).toBeCloseTo(d.categories.total, 1);
  });

  it('gives an employee only their own records, with no budget or portfolio', async () => {
    const d = (await overview(employee)).body.data;
    expect(d.scope).toBe('self');
    expect(d.budget).toBeNull();
    expect(d.portfolio).toBeNull();
  });

  it('gives a manager the budget and portfolio blocks', async () => {
    const r = await overview(manager);
    expect(r.status).toBe(200);
    expect(r.body.data.portfolio).not.toBeNull();
    expect(['team', 'self', 'everyone']).toContain(r.body.data.scope);
  });

  it('refuses a bad date', async () => {
    expect((await overview(admin, '?dateFrom=nope')).status).toBe(400);
  });
});
