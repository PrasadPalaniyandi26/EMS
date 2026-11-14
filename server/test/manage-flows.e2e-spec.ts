import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// The Manage records: clients, projects and products. What each one checks, what a partial change leaves alone,
// what stops a delete, and who may change them.
// Test data starts with "ZZ " (and the ZZ users, and the financial year 2096) and is removed before and after the run.
type Res = { status: number; body: any };
const PASSWORD = 'Test@1234';
const FY = 2096;

describe('Manage records (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string; let manager: string; let finance: string; let employee: string;

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
  const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  let clientId: number; let typeId: number;

  const cleanup = async () => {
    const products = (await prisma.product.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((p) => p.id);
    const projects = (await prisma.project.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((p) => p.id);
    const plan = await prisma.budgetPlan.findUnique({ where: { fy: FY } });
    if (plan) {
      const lines = (await prisma.budgetLine.findMany({ where: { planId: plan.id }, select: { id: true } })).map((l) => l.id);
      await prisma.budgetLinePeriod.deleteMany({ where: { lineId: { in: lines } } });
      await prisma.budgetLine.deleteMany({ where: { planId: plan.id } });
      await prisma.budgetPlan.delete({ where: { id: plan.id } });
    }
    await prisma.buildOrder.deleteMany({ where: { productId: { in: products } } });
    await prisma.product.deleteMany({ where: { id: { in: products } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.client.deleteMany({ where: { name: { startsWith: 'ZZ ' } } });
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
    await makeUser('zz_mgr', 'MANAGER'); await makeUser('zz_finance', 'FINANCE');
    admin = await login('admin', 'admin123'); manager = await login('zz_mgr', PASSWORD); finance = await login('zz_finance', PASSWORD); employee = await login('emp1', 'Test@1234');
    typeId = (await prisma.projectType.findFirstOrThrow({ where: { isActive: true } })).id;
  }, 90000);

  afterAll(async () => { await cleanup(); await app.close(); });

  describe('clients', () => {
    it('need a name, and a real email and phone when they are given', async () => {
      expect((await call('post', '/clients', manager, {})).status).toBe(400);
      expect((await call('post', '/clients', manager, { name: '   ' })).status).toBe(400);
      expect((await call('post', '/clients', manager, { name: 'ZZ Bad mail', contact_email: 'nope' })).status).toBe(400);
      expect((await call('post', '/clients', manager, { name: 'ZZ Bad phone', contact_phone: 'abc' })).status).toBe(400);
      const ok = await call('post', '/clients', manager, { name: 'ZZ Client', contact_email: 'a@b.co', contact_phone: '+91 98765 43210', description: 'Keep me', city: 'Pune', country: 'India' });
      expect(ok.status).toBe(201);
      clientId = data(ok).id;
      expect(data(ok).code).toMatch(/^CL-IN-/);
    });

    it('a name is unique whatever its case', async () => {
      const dup = await call('post', '/clients', manager, { name: 'zz client' });
      expect(dup.status).toBe(409);
      expect(message(dup)).toMatch(/already exists/);
    });

    it('a change with only some fields leaves the others alone', async () => {
      expect((await call('put', `/clients/${clientId}`, manager, { city: 'Mumbai' })).status).toBe(200);
      const c = data(await call('get', '/clients', manager)).find((x: any) => x.id === clientId);
      expect(c).toMatchObject({ city: 'Mumbai', description: 'Keep me', contact_email: 'a@b.co', is_active: 1 });
    });

    it('only managers and admins change clients', async () => {
      for (const who of [finance, employee]) {
        expect((await call('post', '/clients', who, { name: 'ZZ Nope' })).status).toBe(403);
        expect((await call('put', `/clients/${clientId}`, who, { city: 'X' })).status).toBe(403);
        expect((await call('delete', `/clients/${clientId}`, who)).status).toBe(403);
      }
    });

    it('a client with live projects cannot be deleted; a deactivated one drops out of the pickers', async () => {
      const project = await call('post', '/projects', manager, { name: 'ZZ Held project', client_id: clientId, type_id: typeId });
      expect(project.status).toBe(201);
      const refused = await call('delete', `/clients/${clientId}`, manager);
      expect(refused.status).toBe(409);
      expect(message(refused)).toMatch(/1 project/);
      expect((await call('delete', `/projects/${data(project).id}`, manager)).status).toBe(200);
      expect((await call('delete', `/clients/${clientId}`, manager)).status).toBe(200);
      expect(data(await call('get', '/clients', manager)).some((c: any) => c.id === clientId)).toBe(false);
      expect(data(await call('get', '/clients?all=1', manager)).some((c: any) => c.id === clientId && c.is_active === 0)).toBe(true);
      // Nothing new can be created for it
      expect((await call('post', '/projects', manager, { name: 'ZZ For a gone client', client_id: clientId, type_id: typeId })).status).toBe(400);
      expect((await call('put', `/clients/${clientId}`, manager, { is_active: true })).status).toBe(200);
    });
  });

  describe('projects', () => {
    let projectId: number;
    const make = (b: Record<string, unknown>) => call('post', '/projects', manager, { name: 'ZZ Project', client_id: clientId, type_id: typeId, ...b });

    it('need a name, an existing client, real dates in order, and a known status', async () => {
      expect((await make({ name: '' })).status).toBe(400);
      expect((await make({ client_id: undefined })).status).toBe(400);
      expect((await make({ client_id: 999999 })).status).toBe(404);
      expect((await make({ type_id: 999999 })).status).toBe(404);
      expect((await make({ lead_id: 999999 })).status).toBe(404);
      expect((await make({ start_date: 'not a date' })).status).toBe(400);
      expect((await make({ start_date: day(10), end_date: day(1) })).status).toBe(400);
      expect((await make({ status: 'Whenever' })).status).toBe(400);
      const ok = await make({ description: 'Scope stays', start_date: day(1), end_date: day(30), status: 'Proposed' });
      expect(ok.status).toBe(201);
      projectId = data(ok).id;
      expect(data(ok).code).toMatch(/^PRJ-/);
    });

    it('a client has one project of a name', async () => {
      const dup = await make({ name: 'zz PROJECT' });
      expect(dup.status).toBe(409);
      expect(message(dup)).toMatch(/already has a project/);
    });

    it('a change with only some fields leaves the others alone, and the end date is checked against the stored start', async () => {
      expect((await call('put', `/projects/${projectId}`, manager, { status: 'Active' })).status).toBe(200);
      const p = data(await call('get', `/projects?clientId=${clientId}`, manager)).find((x: any) => x.id === projectId);
      expect(p).toMatchObject({ status: 'Active', description: 'Scope stays', type_id: typeId });
      expect(p.start_date).toBeTruthy();
      expect((await call('put', `/projects/${projectId}`, manager, { end_date: day(-20) })).status).toBe(400);
    });

    it('only managers and admins change projects', async () => {
      for (const who of [finance, employee]) {
        expect((await call('post', '/projects', who, { name: 'ZZ Nope', client_id: clientId, type_id: typeId })).status).toBe(403);
        expect((await call('delete', `/projects/${projectId}`, who)).status).toBe(403);
      }
    });

    it('a project with budget lines in a live plan cannot be deleted', async () => {
      const plan = await call('post', '/budgets/plans', admin, { fy: FY, name: 'ZZ manage flows' });
      expect(plan.status).toBe(201);
      const planId = (await prisma.budgetPlan.findUniqueOrThrow({ where: { fy: FY } })).id;
      const type = await prisma.categoryType.findFirstOrThrow({ where: { OR: [{ appliesTo: null }, { appliesTo: { contains: 'PROJECT' } }] } });
      const line = await call('post', '/budgets/lines', admin, { plan_id: planId, cost_object: 'PROJECT', project_id: projectId, type_id: type.id, periods: Array.from({ length: 12 }, () => 100) });
      expect(line.status).toBe(201);
      const refused = await call('delete', `/projects/${projectId}`, manager);
      expect(refused.status).toBe(409);
      expect(message(refused)).toMatch(new RegExp(String(FY)));
      expect((await call('delete', `/budgets/lines/${data(line).id}?reason=test`, admin)).status).toBe(200);
      expect((await call('delete', `/projects/${projectId}`, manager)).status).toBe(200);
    });
  });

  describe('products', () => {
    let productId: number; let productType: number;
    const make = (b: Record<string, unknown>) => call('post', '/products', manager, { name: 'ZZ Product', client_id: clientId, type_id: productType, ...b });
    beforeAll(async () => { productType = (await prisma.productType.findFirstOrThrow({ where: { isActive: true } })).id; });

    it('need a name, an existing client, real dates in order, and a known stage', async () => {
      expect((await make({ name: '' })).status).toBe(400);
      expect((await make({ client_id: 999999 })).status).toBe(404);
      expect((await make({ end_date: 'soon' })).status).toBe(400);
      expect((await make({ start_date: day(9), end_date: day(2) })).status).toBe(400);
      expect((await make({ status: 'Shipped' })).status).toBe(400);
      const ok = await make({ description: 'Notes stay', status: 'Prototype' });
      expect(ok.status).toBe(201);
      productId = data(ok).id;
      expect(data(ok).code).toMatch(/^PRD-/);
      expect((await make({ name: 'zz product' })).status).toBe(409);
    });

    it('a change with only some fields leaves the others alone', async () => {
      expect((await call('put', `/products/${productId}`, manager, { status: 'Pilot' })).status).toBe(200);
      const p = data(await call('get', `/products?clientId=${clientId}`, manager)).find((x: any) => x.id === productId);
      expect(p).toMatchObject({ status: 'Pilot', description: 'Notes stay' });
    });

    it('a product with an open order cannot be deleted until the order is cancelled', async () => {
      const order = await call('post', '/build-orders', admin, { product_id: productId, client_id: clientId, quantity: 1, start_date: day(0), delivery_date: day(40) });
      expect(order.status).toBe(201);
      const refused = await call('delete', `/products/${productId}`, manager);
      expect(refused.status).toBe(409);
      expect(message(refused)).toMatch(/open order/);
      expect((await call('post', `/build-orders/${data(order).id}/cancel`, admin, { reason: 'Test' })).status).toBe(201);
      expect((await call('delete', `/products/${productId}`, manager)).status).toBe(200);
    });
  });
});
