import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// The budget plan from draft to approved, its lines, budget changes and the month close.
// Test data uses the financial year 2095 and the ZZ users, and is removed before and after the run.
type Res = { status: number; body: any };
const FY = 2095;
const PASSWORD = 'Test@1234';
const twelve = (v: number) => Array.from({ length: 12 }, () => v);

describe('Budget flows (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string; let finance: string; let operations: string; let manager: string;
  let startMonth: number; let deptId: number; let typeId: number;
  let reserveLine: number; let deptLine: number;
  let lastMonth: { year: number; month: number };

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
  const data = (r: Res) => r.body?.data;
  const message = (r: Res) => r.body?.error?.message ?? r.body?.message ?? '';
  const login = async (username: string, password: string) => {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password });
    if (!r.body?.data?.accessToken) throw new Error(`Login failed for ${username} (${r.status})`);
    return r.body.data.accessToken as string;
  };
  const makeUser = async (username: string, roleName: string) => {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    const user = await prisma.user.create({ data: { username, loginName: username, email: `${username}@test.local`, passwordHash: await bcrypt.hash(PASSWORD, 4), roleId: role.id } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, isDefault: true } });
  };
  const amountIn = async (lineId: number, m: { year: number; month: number }) =>
    Number((await prisma.budgetLinePeriod.findUniqueOrThrow({ where: { lineId_year_month: { lineId, year: m.year, month: m.month } } })).amount);

  const cleanup = async () => {
    const plan = await prisma.budgetPlan.findUnique({ where: { fy: FY } });
    if (plan) {
      const lines = (await prisma.budgetLine.findMany({ where: { planId: plan.id }, select: { id: true } })).map((l) => l.id);
      await prisma.budgetChange.deleteMany({ where: { OR: [{ fromLineId: { in: lines } }, { toLineId: { in: lines } }] } });
      await prisma.varianceNote.deleteMany({ where: { lineId: { in: lines } } });
      await prisma.budgetAlert.deleteMany({ where: { lineId: { in: lines } } });
      await prisma.budgetLinePeriod.deleteMany({ where: { lineId: { in: lines } } });
      await prisma.budgetLine.deleteMany({ where: { planId: plan.id } });
      await prisma.budgetPlan.delete({ where: { id: plan.id } });
    }
    await prisma.periodLock.deleteMany({ where: { year: { in: [FY, FY + 1] } } });
    const users = (await prisma.user.findMany({ where: { username: { startsWith: 'zz_' } }, select: { id: true } })).map((u) => u.id);
    await prisma.auditLog.deleteMany({ where: { changedBy: { in: users } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: users } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
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
    await makeUser('zz_finance', 'FINANCE'); await makeUser('zz_operations', 'OPERATIONS'); await makeUser('zz_mgr', 'MANAGER');
    admin = await login('admin', 'admin123'); finance = await login('zz_finance', PASSWORD); operations = await login('zz_operations', PASSWORD); manager = await login('zz_mgr', PASSWORD);
    startMonth = (await call('get', '/budgets/settings', admin)).body.data?.fy_start_month ?? 4;
    // The last month of the year: a change moves money there when the year is not the current one
    const m0 = startMonth - 1 + 11;
    lastMonth = { year: FY + Math.floor(m0 / 12), month: (m0 % 12) + 1 };
    deptId = (await prisma.department.findFirstOrThrow()).id;
    // An expense type that may be charged to a department
    for (const t of await prisma.categoryType.findMany({ orderBy: { id: 'asc' } })) {
      if (!t.appliesTo || t.appliesTo.split(',').some((k) => /DEPARTMENT|OVERHEAD/i.test(k))) { typeId = t.id; break; }
    }
  }, 90000);

  afterAll(async () => { await cleanup(); await app.close(); });

  describe('plan and lines', () => {
    it('one plan per year, and a plan cannot be submitted without lines', async () => {
      expect((await call('post', '/budgets/plans', admin, { fy: FY, name: 'ZZ flows' })).status).toBe(201);
      expect((await call('post', '/budgets/plans', admin, { fy: FY })).status).toBe(409);
      expect((await call('post', `/budgets/plans/${FY}/submit`, admin)).status).toBe(400);
    });

    it('a line needs a type and a cost object, and the same line cannot be added twice', async () => {
      const plan = await prisma.budgetPlan.findUniqueOrThrow({ where: { fy: FY } });
      const line = (b: Record<string, unknown>) => call('post', '/budgets/lines', admin, { plan_id: plan.id, ...b });
      expect((await line({ cost_object: 'NOPE' })).status).toBe(400);
      expect((await line({ cost_object: 'DEPARTMENT', type_id: typeId, periods: twelve(1000) })).status).toBe(400);
      expect((await line({ cost_object: 'DEPARTMENT', department_id: deptId, periods: twelve(1000) })).status).toBe(400);
      const dept = await line({ cost_object: 'DEPARTMENT', department_id: deptId, type_id: typeId, periods: twelve(1000) });
      expect(dept.status).toBe(201);
      deptLine = data(dept).id;
      expect((await line({ cost_object: 'DEPARTMENT', department_id: deptId, type_id: typeId, periods: twelve(1) })).status).toBe(409);
      const reserve = await line({ cost_object: 'RESERVE', periods: twelve(1000) });
      expect(reserve.status).toBe(201);
      reserveLine = data(reserve).id;
      expect((await line({ cost_object: 'RESERVE', periods: twelve(1) })).status).toBe(409);
    });

    it('a submitted plan is locked; the submitter does not approve it; sending it back needs a note', async () => {
      expect((await call('post', `/budgets/plans/${FY}/submit`, admin)).status).toBe(201);
      expect((await call('post', `/budgets/plans/${FY}/submit`, admin)).status).toBe(409);
      expect((await call('delete', `/budgets/plans/${FY}`, admin)).status).toBe(409);
      expect((await call('put', `/budgets/lines/${deptLine}`, admin, { cost_object: 'DEPARTMENT', department_id: deptId, type_id: typeId, periods: twelve(5) })).status).toBe(409);
      expect((await call('post', `/budgets/plans/${FY}/decision`, admin, { decision: 'approve' })).status).toBe(403);
      expect((await call('post', `/budgets/plans/${FY}/decision`, operations, { decision: 'approve' })).status).toBe(403);
      expect((await call('post', `/budgets/plans/${FY}/decision`, finance, { decision: 'send_back' })).status).toBe(400);
      expect((await call('post', `/budgets/plans/${FY}/decision`, finance, { decision: 'send_back', note: 'Check the totals' })).status).toBe(201);
      expect((await call('post', `/budgets/plans/${FY}/submit`, admin)).status).toBe(201);
      expect((await call('post', `/budgets/plans/${FY}/decision`, finance, { decision: 'approve' })).status).toBe(201);
      expect((await prisma.budgetPlan.findUniqueOrThrow({ where: { fy: FY } })).status).toMatch(/APPROVED|ACTIVE/);
    });

    it('an approved plan changes only through Finance with a reason', async () => {
      const body = { cost_object: 'DEPARTMENT', department_id: deptId, type_id: typeId, periods: twelve(1000) };
      expect((await call('put', `/budgets/lines/${deptLine}`, operations, body)).status).toBe(403);
      expect((await call('put', `/budgets/lines/${deptLine}`, finance, body)).status).toBe(400);
      expect((await call('put', `/budgets/lines/${deptLine}`, finance, { ...body, reason: 'Same figures' })).status).toBe(200);
    });
  });

  describe('budget changes', () => {
    const change = (who: string, b: Record<string, unknown>) => call('post', '/budgets/changes', who, b);

    it('asks for a kind, an amount, a reason and the right lines', async () => {
      expect((await change(operations, { kind: 'MOVE', amount: 10, reason: 'x', from_line_id: reserveLine, to_line_id: deptLine })).status).toBe(400);
      expect((await change(operations, { kind: 'TRANSFER', amount: 0, reason: 'x', from_line_id: reserveLine, to_line_id: deptLine })).status).toBe(400);
      expect((await change(operations, { kind: 'TRANSFER', amount: 10, reason: '', from_line_id: reserveLine, to_line_id: deptLine })).status).toBe(400);
      expect((await change(operations, { kind: 'TRANSFER', amount: 10, reason: 'x', from_line_id: reserveLine })).status).toBe(400);
      expect((await change(operations, { kind: 'TRANSFER', amount: 10, reason: 'x', from_line_id: reserveLine, to_line_id: reserveLine })).status).toBe(400);
      expect((await change(operations, { kind: 'TRANSFER', amount: 10, reason: 'x', from_line_id: 999999, to_line_id: deptLine })).status).toBe(404);
      expect((await change(manager, { kind: 'TRANSFER', amount: 10, reason: 'x', from_line_id: reserveLine, to_line_id: deptLine })).status).toBe(403);
    });

    it('moves the money when Finance approves, but not for the person who asked or for a manager', async () => {
      const mine = await change(admin, { kind: 'TRANSFER', amount: 250, reason: 'Cover the overrun', from_line_id: reserveLine, to_line_id: deptLine });
      expect(mine.status).toBe(201);
      const id = data(mine).id;
      expect((await call('post', `/budgets/changes/${id}/decision`, manager, { decision: 'approve' })).status).toBe(403);
      expect((await call('post', `/budgets/changes/${id}/decision`, admin, { decision: 'approve' })).status).toBe(403);
      expect((await call('post', `/budgets/changes/${id}/decision`, finance, { decision: 'reject' })).status).toBe(400);
      const from = await amountIn(reserveLine, lastMonth); const to = await amountIn(deptLine, lastMonth);
      expect((await call('post', `/budgets/changes/${id}/decision`, finance, { decision: 'approve' })).status).toBe(201);
      expect(await amountIn(reserveLine, lastMonth)).toBe(from - 250);
      expect(await amountIn(deptLine, lastMonth)).toBe(to + 250);
      expect((await call('post', `/budgets/changes/${id}/decision`, finance, { decision: 'approve' })).status).toBe(409);
    });

    it('refuses to move more than the line holds, and refuses money in a closed month', async () => {
      const big = data(await change(admin, { kind: 'TRANSFER', amount: 5000, reason: 'Too much', from_line_id: reserveLine, to_line_id: deptLine })).id;
      expect((await call('post', `/budgets/changes/${big}/decision`, finance, { decision: 'approve' })).status).toBe(400);
      const small = data(await change(admin, { kind: 'TRANSFER', amount: 10, reason: 'Closed month', from_line_id: reserveLine, to_line_id: deptLine })).id;
      expect((await call('post', '/budgets/close/lock', finance, { year: lastMonth.year, month: lastMonth.month })).status).toBe(201);
      const closed = await call('post', `/budgets/changes/${small}/decision`, finance, { decision: 'approve' });
      expect(closed.status).toBe(409);
      expect(message(closed)).toMatch(/closed/i);
      expect((await call('post', '/budgets/close/unlock', admin, { year: lastMonth.year, month: lastMonth.month })).status).toBe(201);
      expect((await call('post', `/budgets/changes/${small}/decision`, finance, { decision: 'approve' })).status).toBe(201);
    });

    it('only the requester, Finance or Admin can withdraw a pending change', async () => {
      const id = data(await change(operations, { kind: 'TRANSFER', amount: 5, reason: 'Withdraw me', from_line_id: reserveLine, to_line_id: deptLine })).id;
      expect((await call('delete', `/budgets/changes/${id}`, manager)).status).toBe(403);
      expect((await call('delete', `/budgets/changes/${id}`, operations)).status).toBe(200);
    });
  });

  describe('month close', () => {
    const month = { year: FY + 1, month: 1 };

    it('refuses a month that is not a month', async () => {
      expect((await call('get', '/budgets/close?year=abc&month=4', admin)).status).toBe(400);
      expect((await call('get', `/budgets/close?year=${FY}&month=13`, admin)).status).toBe(400);
      expect((await call('post', '/budgets/close/lock', finance, { year: FY, month: 0 })).status).toBe(400);
      expect((await call('post', '/budgets/close/variance', operations, { line_id: deptLine, year: FY, month: 99, reason_code: 'TIMING' })).status).toBe(400);
    });

    it('a variance note needs a reason and a real line', async () => {
      expect((await call('post', '/budgets/close/variance', operations, { line_id: deptLine, year: month.year, month: month.month })).status).toBe(400);
      expect((await call('post', '/budgets/close/variance', operations, { line_id: 999999, year: month.year, month: month.month, reason_code: 'TIMING' })).status).toBe(404);
      expect((await call('post', '/budgets/close/variance', operations, { line_id: deptLine, year: month.year, month: month.month, reason_code: 'TIMING', comment: 'Late invoice' })).status).toBe(201);
    });

    it('Finance closes a month, nobody can add a note to it, and only an Admin reopens it', async () => {
      expect((await call('post', '/budgets/close/lock', manager, month)).status).toBe(403);
      expect((await call('post', '/budgets/close/lock', finance, month)).status).toBe(201);
      expect((await call('post', '/budgets/close/lock', finance, month)).status).toBe(409);
      expect((await call('post', '/budgets/close/variance', operations, { line_id: deptLine, year: month.year, month: month.month, reason_code: 'TIMING' })).status).toBe(409);
      expect((await call('post', '/budgets/close/unlock', finance, month)).status).toBe(403);
      expect((await call('post', '/budgets/close/unlock', admin, month)).status).toBe(201);
    });
  });
});
