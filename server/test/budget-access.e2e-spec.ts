import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// Who may change which budget line, and what a closed month refuses.
// Test data uses the ZZ users and the financial years 2090 to 2092, and is removed before and after the run.
// Only one RESERVE line is allowed per plan, so each test line sits in its own year.
type Res = { status: number; body: any };

const FYS = { own: 2090, other: 2091, created: 2092 };
const YEARS = [2090, 2091, 2092];
const PASSWORD = 'Test@1234';

describe('Budget access and closed months (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string;
  let manager: string;
  let operations: string;
  let managerId: number;
  let managerTwoId: number;
  let startMonth: number;
  let ownLine: number;
  let otherLine: number;
  let createdPlanId: number;

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
  const twelve = (value: number) => Array.from({ length: 12 }, () => value);
  const firstMonth = (fy: number) => ({ year: fy, month: startMonth });

  const cleanup = async () => {
    const plans = await prisma.budgetPlan.findMany({ where: { fy: { in: YEARS } }, select: { id: true } });
    const planIds = plans.map((p) => p.id);
    const lines = await prisma.budgetLine.findMany({ where: { planId: { in: planIds } }, select: { id: true } });
    await prisma.budgetLinePeriod.deleteMany({ where: { lineId: { in: lines.map((l) => l.id) } } });
    await prisma.budgetLine.deleteMany({ where: { planId: { in: planIds } } });
    await prisma.budgetPlan.deleteMany({ where: { id: { in: planIds } } });
    await prisma.periodLock.deleteMany({ where: { year: { in: YEARS } } });
    const testUsers = (await prisma.user.findMany({ where: { username: { startsWith: 'zz_' } }, select: { id: true } })).map((u) => u.id);
    await prisma.auditLog.deleteMany({ where: { changedBy: { in: testUsers } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: testUsers } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: testUsers } } });
    await prisma.user.deleteMany({ where: { id: { in: testUsers } } });
  };

  const makeUser = async (username: string, roleName: string) => {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    const user = await prisma.user.create({
      data: { username, loginName: username, email: `${username}@test.local`, passwordHash: await bcrypt.hash(PASSWORD, 4), roleId: role.id },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, isDefault: true } });
    return user.id;
  };

  const makePlan = async (fy: number) => {
    const r = await call('post', '/budgets/plans', admin, { fy, name: `ZZ access test ${fy}` });
    if (r.status !== 201) throw new Error(`Setup plan ${fy} failed (${r.status}): ${JSON.stringify(r.body)}`);
    return (await prisma.budgetPlan.findUniqueOrThrow({ where: { fy } })).id;
  };

  const makeLine = async (planId: number, ownerId: number) => {
    const r = await call('post', '/budgets/lines', admin, { plan_id: planId, cost_object: 'RESERVE', owner_id: ownerId, periods: twelve(100) });
    if (r.status !== 201) throw new Error(`Setup line failed (${r.status}): ${JSON.stringify(r.body)}`);
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

    managerId = await makeUser('zz_manager', 'MANAGER');
    managerTwoId = await makeUser('zz_manager_two', 'MANAGER');
    await makeUser('zz_operations', 'OPERATIONS');

    admin = await login('admin', 'admin123');
    manager = await login('zz_manager', PASSWORD);
    operations = await login('zz_operations', PASSWORD);

    const settings = await call('get', '/budgets/settings', admin);
    startMonth = settings.body.data?.fy_start_month ?? 4;

    ownLine = await makeLine(await makePlan(FYS.own), managerId);
    otherLine = await makeLine(await makePlan(FYS.other), managerTwoId);
    createdPlanId = await makePlan(FYS.created);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('who may change a line', () => {
    it('lets a manager change a line they own', async () => {
      const r = await call('put', `/budgets/lines/${ownLine}`, manager, { cost_object: 'RESERVE', periods: twelve(110) });
      expect(r.status).toBe(200);
    });

    it('stops a manager changing a line someone else owns', async () => {
      const r = await call('put', `/budgets/lines/${otherLine}`, manager, { cost_object: 'RESERVE', periods: twelve(999) });
      expect(r.status).toBe(403);
      expect(message(r)).toMatch(/line owner/i);
    });

    it('hides another manager\'s line from a manager', async () => {
      expect((await call('get', `/budgets/lines/${otherLine}`, manager)).status).toBe(404);
      expect((await call('get', `/budgets/lines/${ownLine}`, manager)).status).toBe(200);
      expect((await call('get', `/budgets/lines/${otherLine}`, admin)).status).toBe(200);
    });

    it('lets Operations change any draft line', async () => {
      const r = await call('put', `/budgets/lines/${otherLine}`, operations, { cost_object: 'RESERVE', periods: twelve(120) });
      expect(r.status).toBe(200);
    });

    it('forces a manager to own any line they create', async () => {
      const r = await call('post', '/budgets/lines', manager, { plan_id: createdPlanId, cost_object: 'RESERVE', owner_id: managerTwoId, periods: twelve(50) });
      expect(r.status).toBe(201);
      const created = await prisma.budgetLine.findUniqueOrThrow({ where: { id: r.body.data.id } });
      expect(created.ownerId).toBe(managerId);
    });
  });

  describe('closed months', () => {
    it('refuses a change to a locked month and allows it again after reopening', async () => {
      const lock = await call('post', '/budgets/close/lock', admin, firstMonth(FYS.own));
      expect(lock.status).toBe(201);

      const blocked = await call('put', `/budgets/lines/${ownLine}/period`, admin, { ...firstMonth(FYS.own), amount: 999, reason: 'test' });
      expect(blocked.status).toBe(400);
      expect(message(blocked)).toMatch(/is closed/i);

      const unlock = await call('post', '/budgets/close/unlock', admin, firstMonth(FYS.own));
      expect(unlock.status).toBe(201);

      const allowed = await call('put', `/budgets/lines/${ownLine}/period`, admin, { ...firstMonth(FYS.own), amount: 999, reason: 'test' });
      expect(allowed.status).toBe(200);
    });

    it('refuses a line delete that would change a locked month', async () => {
      await call('post', '/budgets/close/lock', admin, firstMonth(FYS.other));
      const r = await call('delete', `/budgets/lines/${otherLine}?reason=test`, admin);
      expect(r.status).toBe(400);
      expect(message(r)).toMatch(/is closed/i);
      await call('post', '/budgets/close/unlock', admin, firstMonth(FYS.other));
    });
  });
});
