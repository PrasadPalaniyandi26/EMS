import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// Costing from the product and the project side: who may do what, the BOM and its operations, price and margins,
// the standard cost and the project estimate, baseline and milestones.
// Test data uses the ZZ prefix (and the ZZ users) and is removed before and after the run.
type Res = { status: number; body: any };
const PASSWORD = 'Test@1234';

describe('Costing flows (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string; let finance: string; let configurator: string; let operations: string; let manager: string;
  let clientId: number; let productId: number; let projectId: number;
  let partId: number;

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
    return user.id;
  };
  const today = () => new Date().toISOString().slice(0, 10);

  const cleanup = async () => {
    const products = (await prisma.product.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((p) => p.id);
    const projects = (await prisma.project.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((p) => p.id);
    await prisma.standardCost.deleteMany({ where: { productId: { in: products } } });
    await prisma.productPrice.deleteMany({ where: { productId: { in: products } } });
    await prisma.bomOperation.deleteMany({ where: { bom: { OR: [{ productId: { in: products } }, { projectId: { in: projects } }] } } });
    await prisma.bomLine.deleteMany({ where: { bom: { OR: [{ productId: { in: products } }, { projectId: { in: projects } }] } } });
    await prisma.bom.deleteMany({ where: { OR: [{ productId: { in: products } }, { projectId: { in: projects } }] } });
    await prisma.estimateBaseline.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.estimateLine.deleteMany({ where: { estimate: { projectId: { in: projects } } } });
    await prisma.costEstimate.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.projectMilestone.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.product.deleteMany({ where: { id: { in: products } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.itemPriceLog.deleteMany({ where: { item: { partNo: { startsWith: 'ZZ-' } } } });
    await prisma.item.updateMany({ where: { partNo: { startsWith: 'ZZ-' } }, data: { alternateGroupId: null, isDefaultAlternate: false } });
    await prisma.item.deleteMany({ where: { partNo: { startsWith: 'ZZ-' } } });
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
    await makeUser('zz_finance', 'FINANCE'); await makeUser('zz_configurator', 'CONFIGURATOR'); await makeUser('zz_operations', 'OPERATIONS'); await makeUser('zz_mgr', 'MANAGER');
    admin = await login('admin', 'admin123'); finance = await login('zz_finance', PASSWORD); configurator = await login('zz_configurator', PASSWORD);
    operations = await login('zz_operations', PASSWORD); manager = await login('zz_mgr', PASSWORD);
    clientId = (await prisma.client.findFirstOrThrow({ where: { isActive: true } })).id;
    productId = (await prisma.product.create({ data: { clientId, name: 'ZZ Costing product' } })).id;
    projectId = (await prisma.project.create({ data: { clientId, name: 'ZZ Costing project' } })).id;
  }, 90000);

  afterAll(async () => { await cleanup(); await app.close(); });

  describe('who may change a product\'s costing', () => {
    let lineId: number; let opId: number; let labour: any; let card: any;

    it('a Configurator creates a part and builds the BOM, and can take lines and operations out again', async () => {
      const part = await call('post', '/budgets/items', configurator, { part_no: 'ZZ-CF1', name: 'ZZ-CF1', sourcing: 'BUY', standard_price: 100, uom: 'nos', oem_part_no: 'OEM-CF1', lead_time_days: 5 });
      expect(part.status).toBe(201);
      partId = data(part).id;
      const added = await call('post', `/budgets/products/${productId}/bom-lines`, configurator, { item_id: partId, quantity: 2 });
      expect(added.status).toBe(201);
      lineId = data(added).id;
      expect((await call('put', `/budgets/products/${productId}/bom-lines/${lineId}`, configurator, { item_id: partId, quantity: 3 })).status).toBe(200);
      const product = data(await call('get', `/budgets/products/${productId}`, configurator));
      labour = product.operation_types.find((t: any) => !t.is_fixed && !t.is_outsourced);
      card = product.rate_cards[0];
      const op = await call('post', `/budgets/products/${productId}/operations`, configurator, { operation_type_id: labour.id, rate_card_id: card.id, hours: 1, sequence: 1 });
      expect(op.status).toBe(201);
      opId = data(op).id;
      // The Configurator who built them can remove them (this used to answer 403: only Finance and Admin could)
      expect((await call('delete', `/budgets/operations/${opId}`, configurator)).status).toBe(200);
      expect((await call('delete', `/budgets/bom-lines/${lineId}`, configurator)).status).toBe(200);
    });

    it('the BOM and operations belong to the Configurator, Finance and Admin: Operations and a manager cannot change them', async () => {
      for (const who of [operations, manager]) {
        expect((await call('post', `/budgets/products/${productId}/bom-lines`, who, { item_id: partId, quantity: 1 })).status).toBe(403);
        expect((await call('post', `/budgets/products/${productId}/operations`, who, { operation_type_id: labour.id, rate_card_id: card.id, hours: 1 })).status).toBe(403);
        expect((await call('post', '/budgets/items', who, { part_no: 'ZZ-NOPE', name: 'x', sourcing: 'BUY', standard_price: 1, uom: 'nos', oem_part_no: 'x', lead_time_days: 1 })).status).toBe(403);
      }
      const keep = await call('post', `/budgets/products/${productId}/bom-lines`, admin, { item_id: partId, quantity: 2 });
      expect(keep.status).toBe(201);
      lineId = data(keep).id;
      // Operations and a manager cannot delete a product's line either
      expect((await call('delete', `/budgets/bom-lines/${lineId}`, operations)).status).toBe(403);
      expect((await call('delete', `/budgets/bom-lines/${lineId}`, manager)).status).toBe(403);
    });

    it('price, cost settings and purchases are for Finance and Admin only', async () => {
      for (const who of [configurator, operations, manager]) {
        expect((await call('put', `/budgets/products/${productId}/price`, who, { price: 500 })).status).toBe(403);
        expect((await call('put', `/budgets/products/${productId}/bom`, who, { freight_pct: 3, warranty_pct: 2, reason: 'x' })).status).toBe(403);
        expect((await call('post', `/budgets/items/${partId}/purchase`, who, { price: 110 })).status).toBe(403);
      }
    });
  });

  describe('price and margins', () => {
    it('saves a price with margin goals, refuses a minimum above the target, and clears it', async () => {
      expect((await call('put', `/budgets/products/${productId}/price`, finance, { price: 500, target_margin_pct: 30, min_margin_pct: 20 })).status).toBe(200);
      const p = data(await call('get', `/budgets/products/${productId}`, finance)).pricing;
      expect(p).toMatchObject({ price: 500, target_margin_pct: 30, min_margin_pct: 20 });
      expect((await call('put', `/budgets/products/${productId}/price`, finance, { min_margin_pct: 40 })).status).toBe(400);
      expect((await call('put', `/budgets/products/${productId}/price`, finance, { price: -5 })).status).toBe(400);
      expect((await call('put', `/budgets/products/${productId}/price`, finance, { target_margin_pct: 100 })).status).toBe(400);
      expect((await call('put', `/budgets/products/${productId}/price`, finance, { price: '', target_margin_pct: '', min_margin_pct: '' })).status).toBe(200);
      expect(data(await call('get', `/budgets/products/${productId}`, finance)).pricing.price).toBeNull();
    });

    it('cost settings need a reason when they differ from the default', async () => {
      expect((await call('put', `/budgets/products/${productId}/bom`, finance, { freight_pct: 5, warranty_pct: 2 })).status).toBe(400);
      expect((await call('put', `/budgets/products/${productId}/bom`, finance, { freight_pct: 120, warranty_pct: 2, reason: 'x' })).status).toBe(400);
      expect((await call('put', `/budgets/products/${productId}/bom`, finance, { freight_pct: 5, warranty_pct: 2, overhead_rate: 500, reason: 'Test' })).status).toBe(200);
      expect((await call('put', `/budgets/products/${productId}/bom`, finance, { freight_pct: 2, warranty_pct: 1.5, overhead_rate: null })).status).toBe(200);
    });
  });

  describe('standard cost', () => {
    it('needs BOM lines, then goes proposed, approved by someone else, and the product takes the figure', async () => {
      await prisma.bomLine.deleteMany({ where: { bom: { productId } } });
      expect((await call('post', `/budgets/products/${productId}/standard-cost`, admin)).status).toBe(400);
      expect((await call('post', `/budgets/products/${productId}/bom-lines`, admin, { item_id: partId, quantity: 2 })).status).toBe(201);
      const proposed = await call('post', `/budgets/products/${productId}/standard-cost`, admin);
      expect(proposed.status).toBe(201);
      const sid = data(proposed).id;
      // The same figure again is a duplicate
      expect((await call('post', `/budgets/products/${productId}/standard-cost`, admin)).status).toBe(409);
      // Only Finance and Admin approve, and not their own proposal while another approver exists
      expect((await call('post', `/budgets/standard-costs/${sid}/approve`, operations)).status).toBe(403);
      expect((await call('post', `/budgets/standard-costs/${sid}/approve`, admin)).status).toBe(403);
      expect((await call('post', `/budgets/standard-costs/${sid}/approve`, finance)).status).toBe(201);
      const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(Number(product.standardCost)).toBeGreaterThan(0);
      expect((await call('post', `/budgets/standard-costs/${sid}/approve`, finance)).status).toBe(409);
    });

    it('a changed BOM can be proposed again, and a rejection needs a reason', async () => {
      const line = await prisma.bomLine.findFirstOrThrow({ where: { bom: { productId } } });
      expect((await call('put', `/budgets/products/${productId}/bom-lines/${line.id}`, admin, { item_id: partId, quantity: 4 })).status).toBe(200);
      const sid = data(await call('post', `/budgets/products/${productId}/standard-cost`, operations)).id;
      expect((await call('post', `/budgets/standard-costs/${sid}/reject`, finance, {})).status).toBe(400);
      expect((await call('post', `/budgets/standard-costs/${sid}/reject`, finance, { reason: 'Prices are stale' })).status).toBe(201);
      expect((await call('post', `/budgets/standard-costs/${sid}/approve`, finance)).status).toBe(409);
    });
  });

  describe('project estimate, baseline and milestones', () => {
    let lineId: number; let baselineId: number;
    const est = { phase: 'Design', description: 'ZZ design work', quantity: 10, rate: 100, unit: 'h' };

    it('keeps margin goals and rates in range', async () => {
      expect((await call('put', `/budgets/projects/${projectId}/settings`, finance, { contract_value: 10000, target_margin_pct: 30, min_margin_pct: 20 })).status).toBe(200);
      expect((await call('put', `/budgets/projects/${projectId}/settings`, finance, { min_margin_pct: 40 })).status).toBe(400);
      expect((await call('put', `/budgets/projects/${projectId}/settings`, finance, { target_margin_pct: 150 })).status).toBe(400);
      expect((await call('put', `/budgets/projects/${projectId}/settings`, finance, { target_margin_pct: -5 })).status).toBe(400);
      expect((await call('put', `/budgets/projects/${projectId}/settings`, finance, { contract_value: -1 })).status).toBe(400);
      expect((await call('put', `/budgets/projects/${projectId}/settings`, finance, { contingency_pct: 150 })).status).toBe(400);
    });

    it('an estimate line needs a phase, a description, a quantity and a rate; a baseline needs a line', async () => {
      expect((await call('post', `/budgets/projects/${projectId}/baseline`, finance)).status).toBe(400);
      expect((await call('post', `/budgets/projects/${projectId}/estimate-lines`, finance, { ...est, phase: '' })).status).toBe(400);
      expect((await call('post', `/budgets/projects/${projectId}/estimate-lines`, finance, { ...est, quantity: 0 })).status).toBe(400);
      const added = await call('post', `/budgets/projects/${projectId}/estimate-lines`, finance, est);
      expect(added.status).toBe(201);
      lineId = data(added).id;
      expect((await call('put', `/budgets/projects/${projectId}/estimate-lines/${lineId}`, finance, { ...est, quantity: 12 })).status).toBe(200);
    });

    it('a baseline is proposed, rejected with a reason, proposed again and approved by someone else', async () => {
      baselineId = data(await call('post', `/budgets/projects/${projectId}/baseline`, operations)).id;
      expect((await call('post', `/budgets/projects/${projectId}/baseline`, operations)).status).toBe(409);
      expect((await call('post', `/budgets/baselines/${baselineId}/reject`, finance, {})).status).toBe(400);
      expect((await call('post', `/budgets/baselines/${baselineId}/reject`, finance, { reason: 'Too thin' })).status).toBe(201);
      expect((await call('put', `/budgets/projects/${projectId}/estimate-lines/${lineId}`, finance, { ...est, quantity: 14 })).status).toBe(200);
      baselineId = data(await call('post', `/budgets/projects/${projectId}/baseline`, admin)).id;
      expect((await call('post', `/budgets/baselines/${baselineId}/approve`, manager)).status).toBe(403);
      expect((await call('post', `/budgets/baselines/${baselineId}/approve`, admin)).status).toBe(403);
      expect((await call('post', `/budgets/baselines/${baselineId}/approve`, finance)).status).toBe(201);
      const row = await prisma.estimateBaseline.findUniqueOrThrow({ where: { id: baselineId } });
      expect(row.status).toBe('APPROVED');
    });

    it('milestones need a name and real dates, and show on the project', async () => {
      const ms = (b: Record<string, unknown>) => call('post', `/budgets/projects/${projectId}/milestones`, finance, b);
      expect((await ms({ name: '', planned_date: today() })).status).toBe(400);
      expect((await ms({ name: 'ZZ Design', planned_date: 'not a date' })).status).toBe(400);
      expect((await ms({ name: 'ZZ Design', planned_date: today(), done_date: 'nope' })).status).toBe(400);
      const first = await ms({ name: 'ZZ Design', planned_date: today() });
      expect(first.status).toBe(201);
      const second = await ms({ name: 'ZZ Build', planned_date: today() });
      expect(second.status).toBe(201);
      expect((await call('put', `/budgets/projects/${projectId}/milestones/${data(second).id}`, finance, { name: 'ZZ Build', planned_date: today(), done_date: today() })).status).toBe(200);
      const project = data(await call('get', `/budgets/projects/${projectId}`, finance));
      expect(project.milestones.map((m: any) => m.name).sort()).toEqual(['ZZ Build', 'ZZ Design']);
      expect(project.milestones.find((m: any) => m.name === 'ZZ Build').done_date).toBeTruthy();
      expect(project.evm).toBeUndefined();
      expect((await call('delete', `/budgets/milestones/${data(first).id}`, finance)).status).toBe(200);
    });
  });
});
