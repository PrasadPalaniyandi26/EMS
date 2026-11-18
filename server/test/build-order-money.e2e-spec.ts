import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// When a build order's money moves, what was really charged to it, and the checks that keep a copied BOM honest.
// Test data uses the ZZ prefix and is removed before and after the run.
type Res = { status: number; body: any };

describe('Build order money (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string;
  let employee: string;
  let clientId: number;
  let prod: number; let other: number; let seqProd: number; let flatProd: number;
  let a: number; let b: number; let c: number;
  let orderId: number;
  let e200Category: number; let otherCategory: number;

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
  const get = async (id: number) => data(await call('get', `/build-orders/${id}`, admin));
  const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const cleanup = async () => {
    const ids = (await prisma.product.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((p) => p.id);
    await prisma.transaction.deleteMany({ where: { description: { startsWith: 'ZZ ' } } });
    await prisma.buildOrder.deleteMany({ where: { productId: { in: ids } } });
    await prisma.standardCost.deleteMany({ where: { productId: { in: ids } } });
    await prisma.productionPlan.deleteMany({ where: { productId: { in: ids } } });
    await prisma.partReplacement.deleteMany({ where: { OR: [{ item: { partNo: { startsWith: 'ZZ-' } } }, { successor: { partNo: { startsWith: 'ZZ-' } } }] } });
    await prisma.bomLine.deleteMany({ where: { bom: { productId: { in: ids } } } });
    await prisma.bom.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    await prisma.itemPriceLog.deleteMany({ where: { item: { partNo: { startsWith: 'ZZ-' } } } });
    await prisma.item.updateMany({ where: { partNo: { startsWith: 'ZZ-' } }, data: { alternateGroupId: null, replacedById: null } });
    await prisma.item.deleteMany({ where: { partNo: { startsWith: 'ZZ-' } } });
  };
  const newPart = async (partNo: string, price: number, lead: number) => {
    const r = await call('post', '/budgets/items', admin, { part_no: partNo, name: partNo, sourcing: 'BUY', standard_price: price, uom: 'nos', oem_part_no: `OEM-${partNo}`, lead_time_days: lead });
    expect(r.status).toBe(201);
    return data(r).id as number;
  };
  const line = async (product: number, body: Record<string, unknown>) => expect((await call('post', `/budgets/products/${product}/bom-lines`, admin, body)).status).toBe(201);
  const newOrder = async (product = prod, extra: Record<string, unknown> = {}) => data(await call('post', '/build-orders', admin, { product_id: product, client_id: clientId, quantity: 2, start_date: '2027-01-10', delivery_date: '2027-04-10', unit_price: 1000, ...extra })).id as number;
  const expense = (body: Record<string, unknown>) => call('post', '/transactions', admin, { type: 'expense', amount: 500, dateRecorded: localDate(new Date()), description: 'ZZ test', contextType: 'product', productId: prod, categoryId: e200Category, ...body });

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
    const e200 = await prisma.categoryType.findFirstOrThrow({ where: { code: 'E200' } });
    e200Category = (await prisma.category.findFirstOrThrow({ where: { typeId: e200.id, isActive: true, type: 'expense' } })).id;
    otherCategory = (await prisma.category.findFirstOrThrow({ where: { typeId: { not: e200.id }, isActive: true, type: 'expense' } })).id;
    const mk = async (name: string) => (await prisma.product.create({ data: { clientId, name } })).id;
    prod = await mk('ZZ Money product'); other = await mk('ZZ Money other'); seqProd = await mk('ZZ Money in steps'); flatProd = await mk('ZZ Money flat');
    a = await newPart('ZZ-MA', 100, 10); b = await newPart('ZZ-MB', 50, 30); c = await newPart('ZZ-MC', 20, 40);
    await line(prod, { item_id: a, quantity: 2 });
    await line(prod, { item_id: b, quantity: 1 });
    const opType = await prisma.operationType.findFirstOrThrow({ where: { isActive: true, isOutsourced: false, isFixed: false } });
    const card = await prisma.rateCard.findFirstOrThrow({ where: { isActive: true } });
    expect((await call('post', `/budgets/products/${prod}/operations`, admin, { operation_type_id: opType.id, rate_card_id: card.id, hours: 8 })).status).toBe(201);
    await line(other, { item_id: a, quantity: 1 });
    // The same two parts and the same work, in two steps (the arm first, then the rest) and in one step
    const opType2 = await prisma.operationType.findFirstOrThrow({ where: { isActive: true, isOutsourced: false, isFixed: false } });
    const card2 = await prisma.rateCard.findFirstOrThrow({ where: { isActive: true } });
    for (const [product, firstStep, secondStep] of [[seqProd, 1, 2], [flatProd, 1, 1]] as const) {
      await line(product, { item_id: a, quantity: 1, sequence: firstStep, group_name: product === seqProd ? 'Arm' : null });
      await line(product, { item_id: c, quantity: 1, sequence: secondStep });
      expect((await call('post', `/budgets/products/${product}/operations`, admin, { operation_type_id: opType2.id, rate_card_id: card2.id, hours: 8, sequence: firstStep })).status).toBe(201);
      expect((await call('post', `/budgets/products/${product}/operations`, admin, { operation_type_id: opType2.id, rate_card_id: card2.id, hours: 8, sequence: secondStep })).status).toBe(201);
    }
    orderId = await newOrder();
    expect((await call('post', `/build-orders/${orderId}/import-bom`, admin, {})).status).toBe(201);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('spend and cash timing', () => {
    it('puts each part in the month it arrives, the build after the longest lead time, and the sale at delivery', async () => {
      const o = await get(orderId);
      const by = (label: string) => o.schedule.find((m: any) => m.label === label);
      // Part A (lead 10 days): 2 x 100, plus 2% freight, for 2 units, in January. Part B (lead 30 days): 50 + 2%, for 2 units, in February.
      expect(by('Jan 2027').materials).toBe(408);
      expect(by('Feb 2027').materials).toBe(102);
      expect(by('Feb 2027').assembly).toBeGreaterThan(0);
      expect(by('Jan 2027').assembly).toBe(0);
      expect(by('Apr 2027').revenue).toBe(2000);
      const spend = o.schedule.reduce((x: number, m: any) => x + m.spend, 0);
      expect(Math.abs(spend - (o.cost.total - o.cost.warranty) * 2)).toBeLessThan(0.1);
    });

    it('adds the live orders up month by month with a running net and the E200 budget beside it', async () => {
      const cash = data(await call('get', '/build-orders/cash', admin));
      expect(cash.orders).toBeGreaterThanOrEqual(1);
      const labels = cash.months.map((m: any) => m.label);
      expect(labels).toEqual(expect.arrayContaining(['Jan 2027', 'Feb 2027', 'Mar 2027', 'Apr 2027']));
      // No gap in the run of months
      const ym = cash.months.map((m: any) => m.year * 12 + m.month);
      expect(ym.every((v: number, i: number) => i === 0 || v === ym[i - 1] + 1)).toBe(true);
      expect(cash.months.find((m: any) => m.label === 'Jan 2027').materials).toBeGreaterThanOrEqual(408);
      const net = cash.months.reduce((x: number, m: any) => x + m.net, 0);
      expect(Math.abs(cash.months[cash.months.length - 1].cumulative - net)).toBeLessThan(0.1 * cash.months.length);
      expect(cash.months.every((m: any) => m.budget_e200 === null || typeof m.budget_e200 === 'number')).toBe(true);
    });

    it('tells a new order what the product says: cost, BOM, lead times and the earliest delivery', async () => {
      const r = await call('get', `/build-orders/product-defaults?product_id=${prod}&quantity=2&start_date=2027-01-10`, admin);
      expect(r.status).toBe(200);
      const d = data(r);
      expect(d.product_id).toBe(prod);
      expect(d.has_bom).toBe(true);
      expect(d.bom_version).toBe(1);
      expect(d.bom_lines).toBe(2);
      expect(d.unit_cost).toBeGreaterThan(0);
      expect(d.longest_lead_days).toBe(30);
      expect(d.assembly_days).toBe(2);
      // The start plus the longest lead time plus the build, in working days: 10 Jan (a Sunday) + 32 working days
      expect(d.suggested_delivery).toBe('2027-02-23');
      // The price comes from the product's price for the year the order starts in
      await call('put', `/budgets/products/${prod}/price`, admin, { price: 1234, target_margin_pct: 30, min_margin_pct: 20 });
      const priced = data(await call('get', `/build-orders/product-defaults?product_id=${prod}&quantity=1&start_date=${localDate(new Date())}`, admin));
      expect(priced.unit_price).toBe(1234);
      expect(priced.target_margin_pct).toBe(30);
      expect(priced.min_margin_pct).toBe(20);
      expect((await call('get', '/build-orders/product-defaults?product_id=999999', admin)).status).toBe(400);
      expect((await call('get', `/build-orders/product-defaults?product_id=${prod}`, employee)).status).toBe(403);
    });

    it('a later sequence waits for the one before it, so early work overlaps the wait for late parts', async () => {
      // 2 units, 8 hours each step: 16 hours is 2 working days of building. Part A arrives on day 10, part C on day 40.
      const inSteps = await newOrder(seqProd);
      expect((await call('post', `/build-orders/${inSteps}/import-bom`, admin, {})).status).toBe(201);
      const o = await get(inSteps);
      expect(o.lead.longest_lead_days).toBe(40);
      expect(o.lead.assembly_days).toBe(4);
      // Step 1 is built on days 10 to 12 while part C is on its way; step 2 starts when C arrives on day 40 and ends on day 42
      expect(o.lead.stages.map((s: any) => [s.sequence, s.begins_day, s.finish_day])).toEqual([[1, 10, 12], [2, 40, 42]]);
      expect(o.lead.needed_days).toBe(42);
      // Part A has to arrive early enough for both steps; part C only for the second
      expect(o.lines.find((l: any) => l.sequence === 1).tail_days).toBe(4);
      expect(o.lines.find((l: any) => l.sequence === 2).tail_days).toBe(2);
      expect(o.lines.find((l: any) => l.sequence === 1).group_name).toBe('Arm');
    });

    it('the same parts and work in one step wait for every part before any building', async () => {
      const id = await newOrder(flatProd);
      expect((await call('post', `/build-orders/${id}/import-bom`, admin, {})).status).toBe(201);
      const o = await get(id);
      expect(o.lead.stages).toHaveLength(1);
      expect(o.lead.needed_days).toBe(44);
    });
  });

  describe('expenses charged to an order', () => {
    it('lists the orders an expense for the product can use, for anyone who records expenses', async () => {
      const r = await call('get', `/build-orders/for-expense?product_id=${prod}`, employee);
      expect(r.status).toBe(200);
      expect(data(r).some((x: any) => x.id === orderId)).toBe(true);
      expect((await call('get', '/build-orders', employee)).status).toBe(403);
    });

    it('only a product expense can name an order for that product', async () => {
      const wrongContext = await expense({ contextType: 'project', productId: undefined, buildOrderId: orderId });
      expect(wrongContext.status).toBe(400);
      expect(message(wrongContext)).toMatch(/product expense/);
      const otherOrder = await newOrder(other);
      const wrongProduct = await expense({ buildOrderId: otherOrder });
      expect(wrongProduct.status).toBe(400);
      expect(message(wrongProduct)).toMatch(/not for the chosen product/);
      expect((await expense({ buildOrderId: 999999 })).status).toBe(400);
      const gone = await newOrder();
      await call('post', `/build-orders/${gone}/cancel`, admin, { reason: 'test' });
      expect((await expense({ buildOrderId: gone })).status).toBe(400);
      const forExpense = data(await call('get', `/build-orders/for-expense?product_id=${prod}`, admin));
      expect(forExpense.some((x: any) => x.id === gone)).toBe(false);
    });

    it('counts only approved expenses as spent, and shows the rest as waiting', async () => {
      const ok = await expense({ amount: 600, buildOrderId: orderId, description: 'ZZ approved materials' });
      expect(ok.status).toBe(201);
      expect(data(ok).build_order_id).toBe(orderId);
      await prisma.transaction.update({ where: { id: data(ok).id }, data: { status: 'APPROVED' } });
      const other1 = await expense({ amount: 150, categoryId: otherCategory, buildOrderId: orderId, description: 'ZZ approved other' });
      await prisma.transaction.update({ where: { id: data(other1).id }, data: { status: 'APPROVED' } });
      const pending = await expense({ amount: 90, buildOrderId: orderId, description: 'ZZ waiting' });
      await prisma.transaction.update({ where: { id: data(pending).id }, data: { status: 'PENDING_MANAGER' } });
      await expense({ amount: 40, buildOrderId: orderId, description: 'ZZ draft' });
      const o = await get(orderId);
      expect(o.actuals.approved).toBe(750);
      expect(o.actuals.approved_e200).toBe(600);
      expect(o.actuals.approved_other).toBe(150);
      expect(o.actuals.waiting).toBe(90);
      expect(o.actuals.drafts).toBe(1);
      expect(o.actuals.expenses).toHaveLength(4);
      // Expected bought spend is the material, scrap, freight and outsourced work of the BOM, for the units ordered
      const c = o.cost;
      expect(o.actuals.expected_bought).toBeCloseTo((c.material + c.scrap + c.freight + c.outsourced) * 2, 1);
      expect(o.actuals.spend_variance).toBeCloseTo(600 - o.actuals.expected_bought, 1);
      expect(o.actuals.remaining).toBeCloseTo(o.actuals.expected_bought - 600, 1);
      expect(o.actuals.actual_margin_pct).toBeNull();
    });

    it('cannot be deleted while expenses are charged to it', async () => {
      const r = await call('delete', `/build-orders/${orderId}`, admin);
      expect(r.status).toBe(409);
      expect(message(r)).toMatch(/Expenses have been charged/);
    });

    it('shows the real margin once the order is delivered', async () => {
      await call('post', `/build-orders/${orderId}/release`, admin, {});
      await call('post', `/build-orders/${orderId}/start`, admin, {});
      expect((await call('post', `/build-orders/${orderId}/deliver`, admin, {})).status).toBe(201);
      const o = await get(orderId);
      const labour = o.actuals.labour_at_standard;
      const cost = 750 + labour;
      expect(o.actuals.actual_cost).toBeCloseTo(cost, 1);
      expect(o.actuals.actual_profit).toBeCloseTo(2000 - cost, 1);
      expect(o.actuals.actual_margin_pct).toBeCloseTo(((2000 - cost) / 2000) * 100, 1);
    });
  });

  describe('keeping a copied BOM honest', () => {
    it('warns when the product changed since the copy: a newer BOM, a new standard, and a part replaced', async () => {
      const id = await newOrder(prod);
      await call('post', `/build-orders/${id}/import-bom`, admin, {});
      expect((await get(id)).stale).toEqual({ bom_newer: null, standard_changed: false, ended_parts: 0 });
      const bom = await prisma.bom.findFirstOrThrow({ where: { productId: prod }, orderBy: { version: 'desc' } });
      await prisma.standardCost.create({ data: { productId: prod, bomId: bom.id, fy: 2026, material: 1, scrap: 0, freight: 0, conversion: 0, overhead: 0, warranty: 0, total: 99999, status: 'APPROVED' } });
      const successor = await newPart('ZZ-MD', 105, 12);
      const aItem = await prisma.item.findUniqueOrThrow({ where: { id: a } });
      expect((await call('post', `/budgets/items/${a}/replace`, admin, { successor_id: successor, effective_from: localDate(new Date()), reason: 'ZZ test' })).status).toBe(201);
      expect(aItem.status).toBe('ACTIVE');
      const o = await get(id);
      expect(o.stale.bom_newer).toBeGreaterThan(1);
      expect(o.stale.standard_changed).toBe(true);
      expect(o.stale.ended_parts).toBe(1);
      expect(o.lines.find((l: any) => l.part_no === 'ZZ-MA').part_status).toBe('REPLACED');
      // The order keeps its own copy, but the Part master says so
      const usage = data(await call('get', `/budgets/items/${a}/usage`, admin)) as any[];
      expect(usage.some((u) => u.kind === 'ORDER' && u.id === id)).toBe(true);
    });

    it('a line or operation can only be changed through the product that owns it', async () => {
      const bomLine = await prisma.bomLine.findFirstOrThrow({ where: { bom: { productId: other } } });
      const r = await call('put', `/budgets/products/${prod}/bom-lines/${bomLine.id}`, admin, { item_id: bomLine.itemId, quantity: 9 });
      expect(r.status).toBe(404);
      expect(message(r)).toMatch(/different product/);
      expect(Number((await prisma.bomLine.findUniqueOrThrow({ where: { id: bomLine.id } })).quantity)).toBe(1);
    });

    it('an inactive product cannot get an order', async () => {
      const dead = (await prisma.product.create({ data: { clientId, name: 'ZZ Money inactive', isActive: false } })).id;
      expect((await call('post', '/build-orders', admin, { product_id: dead, client_id: clientId, quantity: 1, start_date: '2027-01-10', delivery_date: '2027-02-10' })).status).toBe(400);
    });
  });

  describe('budget lines for an order', () => {
    it('an order has its own line, which takes its expenses before the product does', async () => {
      const plans = data(await call('get', '/budgets/plans', admin));
      const plan = plans.plans.find((p: any) => p.fy === plans.current_fy && ['APPROVED', 'ACTIVE'].includes(p.status));
      if (!plan) return; // no plan is controlling spend in this database
      const e200 = await prisma.categoryType.findFirstOrThrow({ where: { code: 'E200' } });
      const order = await get(orderId);
      const headroom = async (withOrder: boolean) => data(await call('get', `/budgets/headroom?contextType=product&productId=${prod}&categoryId=${e200Category}&amount=100${withOrder ? `&buildOrderId=${orderId}` : ''}`, employee));
      const body = { plan_id: plan.id, cost_object: 'ORDER', build_order_id: orderId, type_id: e200.id, total: 1000, reason: 'ZZ test' };

      const made = await call('post', '/budgets/lines', admin, body);
      expect(made.status).toBe(201);
      const lineId = data(made).id as number;
      expect((await call('post', '/budgets/lines', admin, body)).status).toBe(409);
      expect((await call('post', '/budgets/lines', admin, { ...body, build_order_id: 999999 })).status).toBe(404);
      expect((await call('post', '/budgets/lines', admin, { ...body, build_order_id: undefined })).status).toBe(400);

      expect((await headroom(true)).line_id).toBe(lineId);
      expect((await headroom(false)).line_id).not.toBe(lineId);
      const monitor = data(await call('get', `/budgets/monitor?fy=${plans.current_fy}`, admin));
      const mine = monitor.lines.find((l: any) => l.id === lineId);
      expect(mine.cost_object).toBe('ORDER');
      expect(mine.build_order_id).toBe(orderId);
      expect(mine.object_code).toBe(order.code);

      expect((await call('delete', `/budgets/lines/${lineId}?reason=ZZ%20test`, admin)).status).toBe(200);
    });
  });
});
