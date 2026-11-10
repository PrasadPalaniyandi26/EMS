import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// Build orders on the real database: create, import of the standard BOM, the lock, swap to an alternate,
// the lead-time and build-plan checks, and the status flow. Test data uses the ZZ- prefix and is removed before and after the run.
type Res = { status: number; body: any };

describe('Build orders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string;
  let employee: string;
  let clientId: number;
  let productId: number;

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
    return r.body.data.accessToken as string;
  };
  // The server dates in its own time zone, so the tests do too
  const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const inDays = (n: number) => localDate(new Date(Date.now() + n * 86400000));

  const cleanup = async () => {
    const ids = (await prisma.product.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((p) => p.id);
    await prisma.buildOrder.deleteMany({ where: { productId: { in: ids } } });
    await prisma.productionPlan.deleteMany({ where: { productId: { in: ids } } });
    await prisma.bomLine.deleteMany({ where: { bom: { productId: { in: ids } } } });
    await prisma.bom.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { name: { startsWith: 'ZZ ' } } });
    await prisma.itemPriceLog.deleteMany({ where: { item: { partNo: { startsWith: 'ZZ-' } } } });
    await prisma.item.updateMany({ where: { partNo: { startsWith: 'ZZ-' } }, data: { alternateGroupId: null, isDefaultAlternate: false } });
    await prisma.item.deleteMany({ where: { partNo: { startsWith: 'ZZ-' } } });
  };

  const newPart = async (partNo: string, price: number, lead: number | null) => {
    const r = await call('post', '/budgets/items', admin, { part_no: partNo, name: partNo, sourcing: 'BUY', standard_price: price, uom: 'nos', oem_part_no: `OEM-${partNo}`, ...(lead != null ? { lead_time_days: lead } : {}) });
    expect(r.status).toBe(201);
    return data(r).id as number;
  };
  const order = (extra: Record<string, unknown> = {}) => call('post', '/build-orders', admin, { product_id: productId, client_id: clientId, quantity: 2, start_date: inDays(0), delivery_date: inDays(60), ...extra });
  const get = async (id: number) => data(await call('get', `/build-orders/${id}`, admin));

  let p1: number; let p2: number; let p3: number;

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
    clientId = (await prisma.client.findFirstOrThrow({ where: { isActive: true } })).id;
    productId = (await prisma.product.create({ data: { clientId, name: 'ZZ Build product', code: null } })).id;
    // Two interchangeable parts (P1 default, P2 dearer and slow to arrive) and one with no alternate
    p1 = await newPart('ZZ-P1', 10, 20);
    p2 = await newPart('ZZ-P2', 12, 50);
    p3 = await newPart('ZZ-P3', 5, 5);
    expect((await call('post', `/budgets/items/${p1}/alternates`, admin, { alternate_id: p2 })).status).toBe(201);
    expect((await call('post', `/budgets/products/${productId}/bom-lines`, admin, { item_id: p1, quantity: 2 })).status).toBe(201);
    expect((await call('post', `/budgets/products/${productId}/bom-lines`, admin, { item_id: p3, quantity: 1 })).status).toBe(201);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('create', () => {
    it('needs the customer, dates and units, and delivery after the start', async () => {
      expect((await order({ client_id: undefined })).status).toBe(400);
      expect((await order({ start_date: undefined })).status).toBe(400);
      expect((await order({ delivery_date: undefined })).status).toBe(400);
      expect((await order({ quantity: 0 })).status).toBe(400);
      expect((await order({ quantity: 1.5 })).status).toBe(400);
      expect((await order({ delivery_date: inDays(0) })).status).toBe(400);
      expect((await order({ unit_price: -5 })).status).toBe(400);
    });

    it('only Finance and Admin can create', async () => {
      expect((await call('post', '/build-orders', employee, { product_id: productId, client_id: clientId, quantity: 1, start_date: inDays(0), delivery_date: inDays(30) })).status).toBe(403);
    });

    it('starts committed with a code and no BOM, and cannot be released yet', async () => {
      const r = await order();
      expect(r.status).toBe(201);
      const o = await get(data(r).id);
      expect(o.code).toMatch(/^BO-\d{4,}$/);
      expect(o.status).toBe('COMMITTED');
      expect(o.has_bom).toBe(false);
      const rel = await call('post', `/build-orders/${o.id}/release`, admin, {});
      expect(rel.status).toBe(409);
      expect(message(rel)).toMatch(/Import the standard BOM/);
    });
  });

  describe('standard BOM copy', () => {
    let id: number;
    beforeAll(async () => { id = data(await order()).id; });

    it('is copied with the product cost, and the order keeps its own copy', async () => {
      expect((await call('post', `/build-orders/${id}/import-bom`, admin, {})).status).toBe(201);
      const product = data(await call('get', `/budgets/products/${productId}`, admin));
      const o = await get(id);
      expect(o.lines).toHaveLength(2);
      expect(o.unit_cost).toBe(product.cost.total);
      expect(o.source_bom_version).toBe(product.bom.version);
      expect(o.targets.fy).toBeGreaterThan(2000);
      expect(Array.isArray(o.operations)).toBe(true);
      expect(o.lines.every((l: any) => l.swapped === false)).toBe(true);
      // A part added to the product afterwards does not reach the order
      const extra = await newPart('ZZ-P4', 3, 1);
      expect((await call('post', `/budgets/products/${productId}/bom-lines`, admin, { item_id: extra, quantity: 1 })).status).toBe(201);
      expect((await get(id)).lines).toHaveLength(2);
      const again = await order();
      await call('post', `/build-orders/${data(again).id}/import-bom`, admin, {});
      expect((await get(data(again).id)).lines).toHaveLength(3);
    });

    it('can be replaced by the same product again or by a different product, and the whole copy changes', async () => {
      const other = (await prisma.product.create({ data: { clientId, name: 'ZZ Other build product' } })).id;
      const empty = (await prisma.product.create({ data: { clientId, name: 'ZZ Empty build product' } })).id;
      expect((await call('post', `/budgets/products/${other}/bom-lines`, admin, { item_id: p3, quantity: 7 })).status).toBe(201);
      const own = data(await order()).id;
      expect((await call('post', `/build-orders/${own}/import-bom`, admin, {})).status).toBe(201);
      const first = await get(own);
      expect(first.product_id).toBe(productId);
      const line = first.lines.find((l: any) => l.part_no === 'ZZ-P1');
      await call('post', `/build-orders/${own}/lines/${line.id}/swap`, admin, { item_id: p2 });
      // Same product again: the swap goes back to the standard BOM
      expect(data(await call('post', `/build-orders/${own}/import-bom`, admin, { product_id: productId })).product_changed).toBe(false);
      expect((await get(own)).lines.every((l: any) => l.swapped === false)).toBe(true);
      // A different product: every line is replaced and the order becomes an order for that product
      expect((await call('post', `/build-orders/${own}/import-bom`, admin, { product_id: empty })).status).toBe(409);
      expect((await call('post', `/build-orders/${own}/import-bom`, admin, { product_id: 999999 })).status).toBe(400);
      const r = await call('post', `/build-orders/${own}/import-bom`, admin, { product_id: other });
      expect(r.status).toBe(201);
      expect(data(r).product_changed).toBe(true);
      const after = await get(own);
      expect(after.product_id).toBe(other);
      expect(after.lines.map((l: any) => l.part_no)).toEqual(['ZZ-P3']);
      expect(after.lines[0].quantity).toBe(7);
      // The product's own BOM and orders for the first product are untouched
      expect((await get(id)).lines).toHaveLength(2);
    });

    it('is locked: no edit, removal or new line on the order BOM', async () => {
      const o = await get(id);
      const line = o.lines[0];
      const edit = await call('put', `/budgets/products/${productId}/bom-lines/${line.id}`, admin, { item_id: line.item_id, quantity: 9 });
      expect(edit.status).toBe(409);
      expect(message(edit)).toMatch(/locked/);
      expect((await call('delete', `/budgets/bom-lines/${line.id}`, admin)).status).toBe(409);
      const op = await prisma.bomOperation.create({ data: { bomId: o.bom_id, name: 'Test', hours: 1 } });
      expect((await call('delete', `/budgets/operations/${op.id}`, admin)).status).toBe(409);
      expect((await get(id)).lines[0].quantity).toBe(line.quantity);
      await prisma.bomOperation.delete({ where: { id: op.id } });
    });
  });

  describe('swap to an alternate', () => {
    let id: number; let line1: any; let line3: any;
    beforeAll(async () => {
      id = data(await order()).id;
      await call('post', `/build-orders/${id}/import-bom`, admin, {});
      const o = await get(id);
      line1 = o.lines.find((l: any) => l.part_no === 'ZZ-P1');
      line3 = o.lines.find((l: any) => l.part_no === 'ZZ-P3');
    });

    it('lists only the alternates of the part, with the cost change', async () => {
      expect(line1.alternates.map((a: any) => a.part_no)).toEqual(['ZZ-P2']);
      expect(line1.alternates[0].cost_change).toBe(4);
      expect(line3.alternates).toEqual([]);
    });

    it('refuses a part that is not an alternate, and a part with no alternates', async () => {
      expect((await call('post', `/build-orders/${id}/lines/${line1.id}/swap`, admin, { item_id: p3 })).status).toBe(409);
      expect((await call('post', `/build-orders/${id}/lines/${line3.id}/swap`, admin, { item_id: p1 })).status).toBe(409);
    });

    it('swaps, costs the order again, and can go back', async () => {
      const before = (await get(id)).unit_cost;
      expect((await call('post', `/build-orders/${id}/lines/${line1.id}/swap`, admin, { item_id: p2 })).status).toBe(201);
      const after = await get(id);
      expect(after.unit_cost).toBeGreaterThan(before);
      const l = after.lines.find((x: any) => x.id === line1.id);
      expect(l.part_no).toBe('ZZ-P2');
      expect(l.swapped).toBe(true);
      expect(l.source_part_no).toBe('ZZ-P1');
      // The product itself is untouched
      const product = data(await call('get', `/budgets/products/${productId}`, admin));
      expect(product.lines.some((x: any) => x.part_no === 'ZZ-P1')).toBe(true);
      expect((await call('post', `/build-orders/${id}/lines/${line1.id}/swap`, admin, { item_id: p1 })).status).toBe(201);
      const back = await get(id);
      expect(back.unit_cost).toBe(before);
      expect(back.lines.find((x: any) => x.id === line1.id).swapped).toBe(false);
    });

    it('only Finance and Admin can swap', async () => {
      expect((await call('post', `/build-orders/${id}/lines/${line1.id}/swap`, employee, { item_id: p2 })).status).toBe(403);
    });
  });

  describe('lead time', () => {
    it('warns when a part cannot arrive in the window, and suggests the earliest delivery', async () => {
      const id = data(await order({ delivery_date: inDays(30) })).id;
      await call('post', `/build-orders/${id}/import-bom`, admin, {});
      const o = await get(id);
      expect(o.lead.longest_lead_days).toBe(20);
      expect(o.lead.late).toBe(false);
      const line1 = o.lines.find((l: any) => l.part_no === 'ZZ-P1');
      await call('post', `/build-orders/${id}/lines/${line1.id}/swap`, admin, { item_id: p2 });
      const late = await get(id);
      expect(late.lead.longest_lead_days).toBe(50);
      expect(late.lead.late).toBe(true);
      expect(late.lead.late_lines).toContain(line1.id);
      expect(late.lead.earliest_delivery.slice(0, 10)).toBe(inDays(50));
      const listed = (data(await call('get', '/build-orders', admin)) as any[]).find((x) => x.id === id);
      expect(listed.late).toBe(true);
    });

    it('does not block saving a late order', async () => {
      expect((await order({ delivery_date: inDays(2) })).status).toBe(201);
    });
  });

  describe('build plan', () => {
    it('orders take the plan of the month they start in', async () => {
      const d = new Date();
      await call('put', `/budgets/products/${productId}/build-plan`, admin, { year: d.getFullYear(), month: d.getMonth() + 1, planned_units: 5 });
      const a = data(await order({ quantity: 3 })).id;
      const first = (await get(a)).plan;
      expect(first.planned).toBe(5);
      expect(first.open).toBeLessThanOrEqual(2);
      const taken = first.taken;
      const b = data(await order({ quantity: 10 })).id;
      const second = (await get(b)).plan;
      expect(second.taken).toBe(taken + 10);
      expect(second.over).toBe(true);
      await call('post', `/build-orders/${b}/cancel`, admin, { reason: 'test' });
      expect((await get(a)).plan.taken).toBe(taken);
    });
  });

  describe('build plan on the product', () => {
    it('shows what orders took and delivered for each month, and delivering adds to the built units', async () => {
      const prod = (await prisma.product.create({ data: { clientId, name: 'ZZ Plan product' } })).id;
      expect((await call('post', `/budgets/products/${prod}/bom-lines`, admin, { item_id: p3, quantity: 1 })).status).toBe(201);
      const d = new Date();
      const ym = { year: d.getFullYear(), month: d.getMonth() + 1 };
      await call('put', `/budgets/products/${prod}/build-plan`, admin, { ...ym, planned_units: 10 });
      const make = async (quantity: number) => data(await call('post', '/build-orders', admin, { product_id: prod, client_id: clientId, quantity, start_date: inDays(0), delivery_date: inDays(60) })).id as number;
      const month = async () => {
        const p = data(await call('get', `/budgets/products/${prod}`, admin));
        return { m: p.build_plan.find((x: any) => x.year === ym.year && x.month === ym.month), annual: p.annual };
      };
      const delivered = await make(3); const open = await make(4); const gone = await make(2);
      await call('post', `/build-orders/${gone}/cancel`, admin, { reason: 'test' });
      let { m } = await month();
      expect(m.taken).toBe(7);
      expect(m.open).toBe(3);
      expect(m.delivered).toBe(0);
      expect(m.actual).toBe(0);
      expect(m.orders.map((o: any) => o.id).sort()).toEqual([delivered, open].sort());
      await call('post', `/build-orders/${delivered}/import-bom`, admin, {});
      await call('post', `/build-orders/${delivered}/release`, admin, {});
      await call('post', `/build-orders/${delivered}/start`, admin, {});
      expect((await call('post', `/build-orders/${delivered}/deliver`, admin, {})).status).toBe(201);
      const after = await month();
      m = after.m;
      expect(m.taken).toBe(7);
      expect(m.delivered).toBe(3);
      expect(m.actual).toBe(3);
      expect(after.annual.taken_units).toBe(7);
      expect(after.annual.delivered_units).toBe(3);
      expect(after.annual.open_units).toBe(3);
    });

    it('counts the built units once when two deliveries arrive at the same time', async () => {
      const id = data(await order({ quantity: 5 })).id;
      await call('post', `/build-orders/${id}/import-bom`, admin, {});
      await call('post', `/build-orders/${id}/release`, admin, {});
      await call('post', `/build-orders/${id}/start`, admin, {});
      const d = new Date(Date.now());
      const actual = async () => (await prisma.productionPlan.findUnique({ where: { productId_year_month: { productId, year: d.getFullYear(), month: d.getMonth() + 1 } } }))?.actualUnits ?? 0;
      const before = await actual();
      const [a, b] = await Promise.all([call('post', `/build-orders/${id}/deliver`, admin, {}), call('post', `/build-orders/${id}/deliver`, admin, {})]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect((await actual()) - before).toBe(5);
    });
  });

  describe('status flow', () => {
    it('goes from committed to delivered, and freezes after the build starts', async () => {
      const id = data(await order()).id;
      await call('post', `/build-orders/${id}/import-bom`, admin, {});
      expect((await call('post', `/build-orders/${id}/start`, admin, {})).status).toBe(409);
      expect((await call('post', `/build-orders/${id}/release`, admin, {})).status).toBe(201);
      expect((await call('put', `/build-orders/${id}`, admin, { quantity: 4 })).status).toBe(200);
      expect((await get(id)).quantity).toBe(4);
      expect((await call('post', `/build-orders/${id}/import-bom`, admin, {})).status).toBe(409);
      expect((await call('post', `/build-orders/${id}/start`, admin, {})).status).toBe(201);
      expect((await call('put', `/build-orders/${id}`, admin, { quantity: 5 })).status).toBe(409);
      expect((await call('delete', `/build-orders/${id}`, admin)).status).toBe(409);
      expect((await call('post', `/build-orders/${id}/deliver`, admin, { delivered_on: inDays(10) })).status).toBe(400);
      expect((await call('post', `/build-orders/${id}/deliver`, admin, {})).status).toBe(201);
      const done = await get(id);
      expect(done.status).toBe('DELIVERED');
      expect(done.editable).toBe(false);
      expect((await call('post', `/build-orders/${id}/cancel`, admin, { reason: 'late' })).status).toBe(409);
    });

    it('a released order can be reopened until the build starts', async () => {
      const id = data(await order()).id;
      expect((await call('post', `/build-orders/${id}/reopen`, admin, {})).status).toBe(409);
      await call('post', `/build-orders/${id}/import-bom`, admin, {});
      await call('post', `/build-orders/${id}/release`, admin, {});
      expect((await call('post', `/build-orders/${id}/reopen`, employee, {})).status).toBe(403);
      expect((await call('post', `/build-orders/${id}/reopen`, admin, {})).status).toBe(201);
      expect((await get(id)).status).toBe('COMMITTED');
      // Back to working state: the BOM can be imported again, then released again
      expect((await call('post', `/build-orders/${id}/import-bom`, admin, {})).status).toBe(201);
      await call('post', `/build-orders/${id}/release`, admin, {});
      await call('post', `/build-orders/${id}/start`, admin, {});
      const late = await call('post', `/build-orders/${id}/reopen`, admin, {});
      expect(late.status).toBe(409);
      expect(message(late)).toMatch(/build has started/);
    });

    it('cancel needs a reason, and only an unreleased order can be deleted', async () => {
      const id = data(await order()).id;
      expect((await call('post', `/build-orders/${id}/cancel`, admin, {})).status).toBe(400);
      expect((await call('post', `/build-orders/${id}/cancel`, admin, { reason: 'Customer withdrew' })).status).toBe(201);
      expect((await get(id)).status).toBe('CANCELLED');
      const other = data(await order()).id;
      expect((await call('delete', `/build-orders/${other}`, admin)).status).toBe(200);
      expect((await call('get', `/build-orders/${other}`, admin)).status).toBe(404);
    });
  });
});
