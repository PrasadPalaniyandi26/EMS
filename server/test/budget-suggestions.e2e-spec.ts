import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// The starting amount offered for a new budget line (order, product, project, overhead), and the rule that only a plan for a future year can be deleted.
// Test data starts with "ZZ". Every delete is keyed on a list of ZZ ids, never on a single id that could be undefined.
describe('Budget line suggestions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string; let employee: string;
  let clientId: number; let fy: number;
  let months: { year: number; month: number }[];
  let e200: number; let e300: number; let e400: number;

  const login = async (username: string, password: string) => {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password });
    if (!r.body?.data?.accessToken) throw new Error(`Login failed for ${username}`);
    return r.body.data.accessToken as string;
  };
  const call = (method: 'get' | 'post' | 'put' | 'delete', t: string, url: string, body?: object) => {
    const r = (request(app.getHttpServer()) as any)[method](`/api/v1${url}`).set('Authorization', `Bearer ${t}`);
    return body ? r.send(body) : r;
  };
  const suggest = (t: string, q: string) => call('get', t, `/budgets/line-suggestion?fy=${fy}&${q}`);
  const day = (m: { year: number; month: number }, d: number) => `${m.year}-${String(m.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const cleanup = async () => {
    const products = (await prisma.product.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((p) => p.id);
    const projects = (await prisma.project.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((p) => p.id);
    const depts = (await prisma.department.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((d) => d.id);
    await prisma.transaction.deleteMany({ where: { description: { startsWith: 'ZZ ' } } });
    if (products.length) {
      await prisma.buildOrder.deleteMany({ where: { productId: { in: products } } });
      await prisma.standardCost.deleteMany({ where: { productId: { in: products } } });
      await prisma.productionPlan.deleteMany({ where: { productId: { in: products } } });
      await prisma.bomLine.deleteMany({ where: { bom: { productId: { in: products } } } });
      await prisma.bom.deleteMany({ where: { productId: { in: products } } });
      await prisma.product.deleteMany({ where: { id: { in: products } } });
    }
    if (projects.length) {
      await prisma.estimateLine.deleteMany({ where: { estimate: { projectId: { in: projects } } } });
      await prisma.costEstimate.deleteMany({ where: { projectId: { in: projects } } });
      await prisma.project.deleteMany({ where: { id: { in: projects } } });
    }
    if (depts.length) await prisma.department.deleteMany({ where: { id: { in: depts } } });
    await prisma.itemPriceLog.deleteMany({ where: { item: { partNo: { startsWith: 'ZZ-SG' } } } });
    await prisma.item.deleteMany({ where: { partNo: { startsWith: 'ZZ-SG' } } });
    await prisma.budgetPlan.deleteMany({ where: { fy: { in: [2020, 2088] } } });
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
    employee = await login('emp1', 'Test@1234');
    clientId = (await prisma.client.findFirstOrThrow({ where: { isActive: true, isSystem: false } })).id;
    fy = (await call('get', admin, '/budgets/plans')).body.data.current_fy;
    months = (await call('get', admin, `/budgets/plans/${fy}`)).body.data.months;
    const typeId = async (code: string) => (await prisma.categoryType.findFirstOrThrow({ where: { code } })).id;
    e200 = await typeId('E200'); e300 = await typeId('E300'); e400 = await typeId('E400');
  }, 60000);

  afterAll(async () => { await cleanup(); await app.close(); });

  it('is for people who prepare the budget, and for things it can work out', async () => {
    expect((await suggest(employee, 'cost_object=ORDER&object_id=1')).status).toBe(403);
    expect((await suggest(admin, 'cost_object=RESERVE&object_id=1')).status).toBe(400);
    expect((await suggest(admin, 'cost_object=ORDER')).status).toBe(400);
    expect((await suggest(admin, 'cost_object=ORDER&object_id=99999999')).status).toBe(404);
    expect((await suggest(admin, 'cost_object=PROJECT&object_id=99999999')).status).toBe(404);
  });

  describe('order', () => {
    it('starts from the expected material cost for the quantity, over the months the order runs', async () => {
      const part = async (partNo: string, price: number, lead: number) => (await call('post', admin, '/budgets/items', { part_no: partNo, name: partNo, sourcing: 'BUY', standard_price: price, uom: 'nos', oem_part_no: `OEM-${partNo}`, lead_time_days: lead })).body.data.id as number;
      const productId = (await prisma.product.create({ data: { clientId, name: 'ZZ Suggest product' } })).id;
      expect((await call('post', admin, `/budgets/products/${productId}/bom-lines`, { item_id: await part('ZZ-SG1', 100, 10), quantity: 2 })).status).toBe(201);
      expect((await call('post', admin, `/budgets/products/${productId}/bom-lines`, { item_id: await part('ZZ-SG2', 50, 5), quantity: 1 })).status).toBe(201);
      const made = await call('post', admin, '/build-orders', { product_id: productId, client_id: clientId, quantity: 3, start_date: day(months[2], 10), delivery_date: day(months[4], 20) });
      expect(made.status).toBe(201);
      const id = made.body.data.id as number;
      // No BOM yet: nothing to start from, and it says why
      const empty = (await suggest(admin, `cost_object=ORDER&object_id=${id}`)).body.data;
      expect(empty.amount).toBeNull();
      expect(empty.reason).toMatch(/no BOM/i);
      expect((await call('post', admin, `/build-orders/${id}/import-bom`, {})).status).toBe(201);
      const expected = (await call('get', admin, `/build-orders/${id}`)).body.data.actuals.expected_bought;
      const d = (await suggest(admin, `cost_object=ORDER&object_id=${id}`)).body.data;
      expect(expected).toBeGreaterThan(0);
      expect(d.amount).toBeCloseTo(expected, 2);
      expect(d).toMatchObject({ shape: 'even', from: 2, to: 4, type_id: e200, reason: null });
      expect(d.note).toMatch(/3 units/);
    });
  });

  describe('product', () => {
    it('starts from the planned units for each month at the approved standard cost of what is bought', async () => {
      const productId = (await prisma.product.create({ data: { clientId, name: 'ZZ Planned product' } })).id;
      const none = (await suggest(admin, `cost_object=PRODUCT&object_id=${productId}`)).body.data;
      expect(none.amount).toBeNull();
      expect(none.reason).toMatch(/no approved standard/i);
      const bom = await prisma.bom.create({ data: { productId, version: 1 } });
      await prisma.standardCost.create({ data: { productId, bomId: bom.id, fy, material: 100, scrap: 5, freight: 3, outsourced: 2, conversion: 40, overhead: 10, warranty: 1, total: 161, status: 'APPROVED' } });
      expect((await suggest(admin, `cost_object=PRODUCT&object_id=${productId}`)).body.data.reason).toMatch(/planned units/i);
      await prisma.productionPlan.create({ data: { productId, year: months[0].year, month: months[0].month, plannedUnits: 10 } });
      await prisma.productionPlan.create({ data: { productId, year: months[3].year, month: months[3].month, plannedUnits: 20 } });
      const d = (await suggest(admin, `cost_object=PRODUCT&object_id=${productId}`)).body.data;
      // 110 is what is bought for one unit: material, scrap, freight and outsourced work. Labour and overhead are not expenses.
      expect(d).toMatchObject({ shape: 'month', amount: 3300, type_id: e200 });
      expect(d.months[0]).toBe(1100);
      expect(d.months[3]).toBe(2200);
      expect(d.months.filter((m: number) => m > 0)).toHaveLength(2);
    });
  });

  describe('project', () => {
    const line = (projectId: number, typeId: number, quantity: number, rate: number) =>
      call('post', admin, `/budgets/projects/${projectId}/estimate-lines`, { phase: 'Design', description: 'ZZ work', quantity, rate, unit: 'h', type_id: typeId });

    it('starts from the estimate lines for the chosen expense type, over the months the project runs', async () => {
      const lastOfMonth = (m: { year: number; month: number }) => new Date(Date.UTC(m.year, m.month, 0));
      const project = await prisma.project.create({ data: { clientId, name: 'ZZ Suggest project', start_date: new Date(day(months[2], 1)), end_date: lastOfMonth(months[5]) } });
      expect((await suggest(admin, `cost_object=PROJECT&object_id=${project.id}&type_id=${e200}`)).body.data.reason).toMatch(/no estimate/i);
      await line(project.id, e200, 10, 1000);
      await line(project.id, e200, 5, 1000);
      await line(project.id, e300, 1, 500);
      expect((await suggest(admin, `cost_object=PROJECT&object_id=${project.id}`)).body.data.reason).toMatch(/choose the expense type/i);
      const a = (await suggest(admin, `cost_object=PROJECT&object_id=${project.id}&type_id=${e200}`)).body.data;
      expect(a).toMatchObject({ shape: 'even', amount: 15000, from: 2, to: 5, type_id: e200 });
      expect(a.note).toMatch(/estimate/);
      expect((await suggest(admin, `cost_object=PROJECT&object_id=${project.id}&type_id=${e300}`)).body.data.amount).toBe(500);
      expect((await suggest(admin, `cost_object=PROJECT&object_id=${project.id}&type_id=${e400}`)).body.data.reason).toMatch(/no lines for this expense type/i);
    });

    it('takes only the share of the cost that falls in the plan year when the project runs on past it', async () => {
      // Four months: the last two months of the year and the first two of the next
      const next = (m: { year: number; month: number }, add: number) => { const k = m.year * 12 + (m.month - 1) + add; return { year: Math.floor(k / 12), month: (k % 12) + 1 }; };
      const end = next(months[11], 2);
      const project = await prisma.project.create({ data: { clientId, name: 'ZZ Running-over project', start_date: new Date(day(months[10], 1)), end_date: new Date(Date.UTC(end.year, end.month, 0)) } });
      await line(project.id, e200, 10, 1000);
      const d = (await suggest(admin, `cost_object=PROJECT&object_id=${project.id}&type_id=${e200}`)).body.data;
      expect(d).toMatchObject({ shape: 'even', amount: 5000, from: 10, to: 11 });
      expect(d.note).toMatch(/2 of the project's 4 months/);
    });

    it('prefers the approved baseline to the live estimate', async () => {
      const project = await prisma.project.create({ data: { clientId, name: 'ZZ Baselined project' } });
      await line(project.id, e200, 10, 1000);
      await prisma.estimateBaseline.create({
        data: { projectId: project.id, status: 'APPROVED', direct: 4000, contingency: 0, warranty: 0, total: 4000, contingencyPct: 0, warrantyPct: 0, lines: [{ phase: 'Design', type_id: e200, description: 'ZZ agreed', quantity: 4, rate: 1000, unit: 'h' }] },
      });
      const d = (await suggest(admin, `cost_object=PROJECT&object_id=${project.id}&type_id=${e200}`)).body.data;
      expect(d.amount).toBe(4000);
      expect(d.note).toMatch(/approved baseline/);
      await prisma.estimateBaseline.deleteMany({ where: { projectId: project.id } });
    });
  });

  describe('overhead', () => {
    it('starts from what the department spent in the same months last year, for the chosen type', async () => {
      const dept = await prisma.department.create({ data: { name: 'ZZ Suggest department' } });
      const none = (await suggest(admin, `cost_object=DEPARTMENT&object_id=${dept.id}`)).body.data;
      expect(none.amount).toBeNull();
      expect(none.reason).toMatch(/no approved spend/i);
      const cat = await prisma.category.findFirstOrThrow({ where: { isActive: true, type: 'expense', typeId: { not: null } } });
      const adminId = (await prisma.user.findFirstOrThrow({ where: { username: 'admin' } })).id;
      const spend = (amount: number, m: { year: number; month: number }, status: string) => prisma.transaction.create({
        data: { userId: adminId, type: 'expense', amount, netAmount: amount, totalAmount: amount, dateRecorded: new Date(Date.UTC(m.year - 1, m.month - 1, 15)), categoryId: cat.id, description: 'ZZ overhead spend', status, contextType: 'overhead', departmentId: dept.id },
      });
      await spend(500, months[1], 'APPROVED');
      await spend(250, months[1], 'APPROVED');
      await spend(900, months[6], 'APPROVED');
      await spend(7000, months[2], 'PENDING_FINANCE'); // not settled, so not counted
      const d = (await suggest(admin, `cost_object=DEPARTMENT&object_id=${dept.id}`)).body.data;
      expect(d).toMatchObject({ shape: 'month', amount: 1650 });
      expect(d.months[1]).toBe(750);
      expect(d.months[6]).toBe(900);
      expect(d.months[2]).toBe(0);
      expect((await suggest(admin, `cost_object=DEPARTMENT&object_id=${dept.id}&type_id=${cat.typeId}`)).body.data.amount).toBe(1650);
      const other = await prisma.categoryType.findFirstOrThrow({ where: { kind: 'expense', id: { not: cat.typeId as number } } });
      expect((await suggest(admin, `cost_object=DEPARTMENT&object_id=${dept.id}&type_id=${other.id}`)).body.data.amount).toBeNull();
    });
  });

  describe('plans', () => {
    it('lets only a plan for a future year be deleted', async () => {
      expect((await call('post', admin, '/budgets/plans', { fy: 2088, name: 'ZZ future' })).status).toBe(201);
      expect((await call('post', admin, '/budgets/plans', { fy: 2020, name: 'ZZ past' })).status).toBe(201);
      const past = await call('delete', admin, '/budgets/plans/2020');
      expect(past.status).toBe(409);
      expect(past.body.error.message).toMatch(/future year/i);
      expect((await call('delete', admin, `/budgets/plans/${fy}`)).status).toBe(409);
      expect((await call('delete', admin, '/budgets/plans/2088')).status).toBe(200);
      expect(await prisma.budgetPlan.findUnique({ where: { fy: 2088 } })).toBeNull();
    });
  });
});
