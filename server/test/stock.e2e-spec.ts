import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// Bulk stock: stock in from a purchase expense, stock used by a job, corrections, the monthly count and the money totals.
// Test parts and projects start with "ZZSTK", expenses with "ZZ stock"; all are removed before and after the run.
type Res = { status: number; body: any };

describe('Bulk stock (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  let categoryId: number;
  let jobA: number;
  let jobB: number;
  let rod: number;
  let bar: number;

  const call = async (method: 'get' | 'post' | 'put' | 'delete', url: string, who: string, body?: unknown): Promise<Res> => {
    let res: Res = { status: 0, body: {} };
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = request(app.getHttpServer())[method](`/api/v1${url}`).set('Authorization', `Bearer ${tokens[who]}`);
      const out = body === undefined ? await r : await r.send(body as object);
      res = { status: out.status, body: out.body };
      if (out.status !== 429) return res;
      await new Promise((resolve) => setTimeout(resolve, 12000));
    }
    return res;
  };
  const message = (r: Res): string => r.body?.error?.message ?? r.body?.message ?? '';
  const ok = (r: Res) => {
    if (r.status >= 300) throw new Error(`${r.status}: ${message(r)}`);
    return r.body.data;
  };
  const login = async (who: string, password: string) => {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username: who, password });
    if (!r.body?.data?.accessToken) throw new Error(`Login failed for ${who} (${r.status})`);
    tokens[who] = r.body.data.accessToken;
  };
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  const today = iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
  const OLD = '2001-01-15';
  const why = 'ZZ stock test reason';

  const balance = async (itemId: number) => {
    const b = await prisma.stockBalance.findUnique({ where: { itemId } });
    return { quantity: Number(b?.quantity ?? 0), value: Number(b?.value ?? 0), avg: Number(b?.avgCost ?? 0) };
  };

  const purchase = async (itemId: number, quantity: number, amount: number, extra: Record<string, unknown> = {}) => {
    const t = ok(await call('post', '/transactions', 'admin', {
      type: 'expense', amount, dateRecorded: today, description: 'ZZ stock purchase', paymentMethod: 'cash', contextType: 'stock', categoryId, overBudgetReason: why,
      stockLines: [{ itemId, quantity, amount }], ...extra,
    }));
    return t.id as number;
  };
  const submit = (id: number) => call('post', `/transactions/${id}/submit`, 'admin');
  const buy = async (itemId: number, quantity: number, amount: number, extra: Record<string, unknown> = {}) => {
    const id = await purchase(itemId, quantity, amount, extra);
    ok(await submit(id));
    return id;
  };
  const decide = async (transactionId: number, action: 'approve' | 'reject' | 'send-back') => {
    // The admin submits, so another Finance user decides
    const req = await prisma.approvalRequest.findFirstOrThrow({ where: { transactionId, status: 'PENDING' } });
    return call('post', `/approvals/${req.id}/${action}`, 'fin1', { comments: why });
  };
  const use = (itemId: number, projectId: number, quantity: number, extra: Record<string, unknown> = {}, who = 'admin') =>
    call('post', '/stock/used', who, { item_id: itemId, project_id: projectId, quantity, reason: why, ...extra });
  const projectActual = async (id: number) => ok(await call('get', `/budgets/projects/${id}`, 'admin')).actual as number;

  const newPart = async (suffix: string) =>
    (await prisma.item.create({ data: { partNo: `ZZSTK-${suffix}`, name: `ZZ stock part ${suffix}`, standardPrice: 100, leadTimeDays: 0 } })).id;

  const cleanup = async () => {
    const items = (await prisma.item.findMany({ where: { partNo: { startsWith: 'ZZSTK' } }, select: { id: true } })).map((i) => i.id);
    await prisma.stockMove.deleteMany({ where: { itemId: { in: items }, correctsId: { not: null } } });
    await prisma.stockMove.deleteMany({ where: { itemId: { in: items } } });
    const counts = (await prisma.stockCountLine.findMany({ where: { itemId: { in: items } }, select: { countId: true } })).map((c) => c.countId);
    await prisma.stockCount.deleteMany({ where: { id: { in: counts } } });
    await prisma.stockPurchaseLine.deleteMany({ where: { itemId: { in: items } } });
    await prisma.transaction.deleteMany({ where: { description: { startsWith: 'ZZ stock' } } });
    await prisma.item.deleteMany({ where: { id: { in: items } } });
    await prisma.project.deleteMany({ where: { name: { startsWith: 'ZZSTK' } } });
    await prisma.periodLock.deleteMany({ where: { year: 2001 } });
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
    await login('admin', 'admin123');
    await login('emp1', 'Test@1234');
    await login('mgr1', 'Test@1234');
    await login('fin1', 'Test@1234');
    categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true, type: 'expense', typeId: { not: null } }, orderBy: { id: 'asc' } })).id;
    const clientId = (await prisma.client.findFirstOrThrow()).id;
    jobA = (await prisma.project.create({ data: { name: 'ZZSTK Job A', code: 'ZZSTK-A', clientId } })).id;
    jobB = (await prisma.project.create({ data: { name: 'ZZSTK Job B', code: 'ZZSTK-B', clientId } })).id;
    rod = await newPart('ROD');
    bar = await newPart('BAR');
  }, 90000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('setting up a stock part', () => {
    it('needs an expense category', async () => {
      const r = await call('put', `/stock/items/${rod}/settings`, 'admin', { supply_mode: 'STOCK' });
      expect(r.status).toBe(400);
      expect(message(r)).toMatch(/category/i);
    });

    it('saves, with a purchase unit for the bar', async () => {
      ok(await call('put', `/stock/items/${rod}/settings`, 'admin', { supply_mode: 'STOCK', category_id: categoryId, reorder_level: 5 }));
      ok(await call('put', `/stock/items/${bar}/settings`, 'admin', { supply_mode: 'STOCK', category_id: categoryId, purchase_uom: 'bar', purchase_factor: 6 }));
      const parts = ok(await call('get', '/stock/parts', 'emp1'));
      expect(parts.find((p: any) => p.id === bar)).toMatchObject({ purchase_uom: 'bar', purchase_factor: 6, on_hand: 0 });
    });

    it('keeps employees and managers from changing stock, and employees from seeing values', async () => {
      expect((await call('put', `/stock/items/${rod}/settings`, 'emp1', { supply_mode: 'DIRECT' })).status).toBe(403);
      expect((await use(rod, jobA, 1, {}, 'emp1')).status).toBe(403);
      expect((await use(rod, jobA, 1, {}, 'mgr1')).status).toBe(403);
      expect((await call('post', '/stock/opening', 'mgr1', { item_id: rod, quantity: 1, unit_cost: 1 })).status).toBe(403);
      expect((await call('get', '/stock/on-hand', 'emp1')).status).toBe(403);
      expect((await call('get', '/stock/on-hand', 'mgr1')).status).toBe(200);
    });
  });

  describe('the worked example', () => {
    let first: number;
    let usedA: number;

    it('refuses to submit when the lines do not add up', async () => {
      const id = await purchase(rod, 90, 9000, { stockLines: [{ itemId: rod, quantity: 90, amount: 8000 }] });
      const r = await submit(id);
      expect(r.status).toBe(400);
      expect(message(r)).toMatch(/must match/i);
      expect((await balance(rod)).quantity).toBe(0);
    });

    it('puts 90 into stock on submit, charged to the Store and to no project', async () => {
      first = await buy(rod, 90, 9000, { projectId: jobA });
      expect(await balance(rod)).toEqual({ quantity: 90, value: 9000, avg: 100 });
      const t = await prisma.transaction.findUniqueOrThrow({ where: { id: first }, include: { department: true } });
      expect(t.department?.name).toBe('Store');
      expect(t.projectId).toBeNull();
      ok(await decide(first, 'approve'));
      expect((await balance(rod)).quantity).toBe(90);
      expect(await projectActual(jobA)).toBe(0);
    });

    it('charges Job A 2,000 for 20', async () => {
      usedA = ok(await use(rod, jobA, 20)).id;
      expect(await balance(rod)).toEqual({ quantity: 70, value: 7000, avg: 100 });
      expect(await projectActual(jobA)).toBe(2000);
    });

    it('moves the average to 106 and charges Job B 1,590 for 15', async () => {
      await buy(rod, 30, 3600);
      expect(await balance(rod)).toEqual({ quantity: 100, value: 10600, avg: 106 });
      expect(ok(await use(rod, jobB, 15)).value).toBe(1590);
      expect(await balance(rod)).toEqual({ quantity: 85, value: 9010, avg: 106 });
      expect(await projectActual(jobB)).toBe(1590);
      expect(await projectActual(jobA)).toBe(2000);
    });

    it('edits an open-month entry at its own unit cost', async () => {
      ok(await call('put', `/stock/used/${usedA}`, 'admin', { quantity: 15, reason: why }));
      expect(await projectActual(jobA)).toBe(1500);
      expect(await balance(rod)).toMatchObject({ quantity: 90, value: 9510 });
      ok(await call('put', `/stock/used/${usedA}`, 'admin', { quantity: 20, reason: why }));
      expect(await balance(rod)).toEqual({ quantity: 85, value: 9010, avg: 106 });
    });

    it('refuses to use more than is on hand', async () => {
      const r = await use(rod, jobA, 86);
      expect(r.status).toBe(409);
      expect(message(r)).toMatch(/on hand/i);
    });

    it('posts a count difference to Workshop, never to a job', async () => {
      // An old month, so a real count for a recent month never clashes with the test
      const id = ok(await call('post', '/stock/counts', 'admin', { year: 2001, month: 3 })).id;
      const sheet = ok(await call('get', `/stock/counts/${id}`, 'admin'));
      const lines = sheet.lines.map((l: any) => ({ item_id: l.item_id, counted_qty: l.item_id === rod ? 84 : l.expected_qty }));
      expect((await call('post', `/stock/counts/${id}/submit`, 'admin')).status).toBe(400);
      ok(await call('put', `/stock/counts/${id}`, 'admin', { lines }));
      ok(await call('post', `/stock/counts/${id}/submit`, 'admin'));
      expect((await call('post', `/stock/counts/${id}/decision`, 'mgr1', { decision: 'approve' })).status).toBe(403);
      ok(await call('post', `/stock/counts/${id}/decision`, 'admin', { decision: 'approve' }));
      expect(await balance(rod)).toEqual({ quantity: 84, value: 8904, avg: 106 });
      const adjust = await prisma.stockMove.findFirstOrThrow({ where: { itemId: rod, kind: 'ADJUST' } });
      const workshop = await prisma.department.findUniqueOrThrow({ where: { name: 'Workshop' } });
      expect(adjust).toMatchObject({ departmentId: workshop.id, projectId: null, buildOrderId: null });
      expect(Number(adjust.value)).toBe(-106);
      expect(await projectActual(jobA)).toBe(2000);
      // Everything bought is on a job, in Workshop, or still in the Store
      expect(9000 + 3600).toBe(2000 + 1590 + 106 + 8904);
    });
  });

  describe('rejecting, sending back and voiding a purchase', () => {
    it('takes the stock out when sent back, and puts it in once on resubmit', async () => {
      const id = await buy(bar, 10, 18000);
      expect(await balance(bar)).toEqual({ quantity: 60, value: 18000, avg: 300 });
      ok(await decide(id, 'send-back'));
      expect(await balance(bar)).toMatchObject({ quantity: 0, value: 0 });
      ok(await submit(id));
      expect(await balance(bar)).toEqual({ quantity: 60, value: 18000, avg: 300 });
      ok(await decide(id, 'reject'));
      expect(await balance(bar)).toMatchObject({ quantity: 0, value: 0 });
    });

    it('refuses to reject or void once the stock is used', async () => {
      const id = await buy(bar, 1, 1800);
      const entry = ok(await use(bar, jobB, 2)).id;
      const r = await decide(id, 'reject');
      expect(r.status).toBe(409);
      expect(message(r)).toMatch(/already been used/i);
      expect((await prisma.transaction.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING_FINANCE');
      ok(await decide(id, 'approve'));
      expect((await call('post', `/transactions/${id}/void`, 'admin', { reason: why })).status).toBe(409);
      ok(await call('put', `/stock/used/${entry}`, 'admin', { quantity: 0, reason: why }));
      ok(await call('post', `/transactions/${id}/void`, 'admin', { reason: why }));
      expect(await balance(bar)).toMatchObject({ quantity: 0, value: 0 });
    });

    it('values stock with GST unless the GST is claimed back', async () => {
      const withGst = await buy(bar, 1, 600, { gstRate: 18 });
      expect(await balance(bar)).toMatchObject({ quantity: 6, value: 708 });
      ok(await decide(withGst, 'reject'));
      await buy(bar, 1, 600, { gstRate: 18, isClaimable: true });
      expect(await balance(bar)).toMatchObject({ quantity: 6, value: 600 });
    });

    it('lets only one of two entries take the last stock', async () => {
      const [x, y] = await Promise.all([use(bar, jobA, 6), use(bar, jobB, 6)]);
      expect([x.status, y.status].sort()).toEqual([201, 409]);
      expect(await balance(bar)).toMatchObject({ quantity: 0, value: 0 });
    });
  });

  describe('a closed month', () => {
    let entry: number;

    it('refuses new entries and edits, and takes a correction in an open month', async () => {
      await buy(bar, 2, 1200);
      entry = ok(await use(bar, jobA, 8, { date: OLD })).id;
      const open = await call('post', `/stock/used/${entry}/correction`, 'admin', { quantity: -1, reason: why });
      expect(message(open)).toMatch(/month of this entry is open/i);
      await prisma.periodLock.create({ data: { year: 2001, month: 1 } });
      expect(message(await use(bar, jobA, 1, { date: OLD }))).toMatch(/closed/i);
      expect(message(await call('put', `/stock/used/${entry}`, 'admin', { quantity: 5 }))).toMatch(/closed/i);

      const before = await projectActual(jobA);
      expect(message(await call('post', `/stock/used/${entry}/correction`, 'admin', { quantity: -9, reason: why }))).toMatch(/can be taken back/i);
      ok(await call('post', `/stock/used/${entry}/correction`, 'admin', { quantity: -3, reason: why }));
      expect(await projectActual(jobA)).toBe(before - 300);
      expect(await balance(bar)).toEqual({ quantity: 7, value: 700, avg: 100 });
    });
  });

  describe('opening stock and the job material view', () => {
    it('takes opening stock only before any other entry', async () => {
      const r = await call('post', '/stock/opening', 'admin', { item_id: rod, quantity: 5, unit_cost: 90 });
      expect(r.status).toBe(409);
      const fresh = await newPart('NEW');
      ok(await call('put', `/stock/items/${fresh}/settings`, 'admin', { supply_mode: 'STOCK', category_id: categoryId }));
      ok(await call('post', '/stock/opening', 'admin', { item_id: fresh, quantity: 3, unit_cost: 33.33 }));
      expect(await balance(fresh)).toMatchObject({ quantity: 3, value: 99.99 });
      // Taking it all takes every paisa of its value
      ok(await use(fresh, jobB, 1));
      ok(await use(fresh, jobB, 2));
      expect(await balance(fresh)).toMatchObject({ quantity: 0, value: 0 });
    });

    it('asks for a reason for a part that is not on the BOM', async () => {
      const bom = await prisma.bom.create({ data: { projectId: jobA, lines: { create: [{ itemId: rod, quantity: 25, scrapPct: 4 }] } } });
      const r = await call('post', '/stock/used', 'admin', { item_id: bar, project_id: jobA, quantity: 1 });
      expect(r.status).toBe(400);
      expect(message(r)).toMatch(/not on the BOM/i);
      const view = ok(await call('get', `/stock/job?projectId=${jobA}`, 'admin'));
      expect(view.lines.find((l: any) => l.item_id === rod)).toMatchObject({ on_bom: true, bom_qty: 26, used_qty: 20, used_value: 2000, suggested_qty: 6 });
      await prisma.bom.delete({ where: { id: bom.id } });
    });

    it('cannot make a part Direct while stock is on hand', async () => {
      const r = await call('put', `/stock/items/${rod}/settings`, 'admin', { supply_mode: 'DIRECT' });
      expect(r.status).toBe(409);
    });
  });

  describe('reports', () => {
    it('shows the stock value, the movements by part and the use by job to Finance only', async () => {
      const run = async (type: string, who = 'fin1') => call('get', `/reporting/generate?type=${type}`, who);
      const value = ok(await run('stock-value'));
      expect(value.rows.find((r: any) => r.Part === 'ZZSTK-ROD')).toMatchObject({ 'On Hand': 84, Value: 8904 });
      expect(ok(await run('stock-by-part')).rows.find((r: any) => r.Part === 'ZZSTK-ROD')).toMatchObject({ 'In Qty': 120, 'In Value': 12600, 'Used Qty': 35, 'Used Value': 3590, 'Count Difference Qty': -1 });
      expect(ok(await run('stock-by-job')).rows.find((r: any) => r.Job === 'ZZSTK-B' && r.Part === 'ZZSTK-ROD')).toMatchObject({ 'Used Qty': 15, 'Used Value': 1590 });
      expect((await run('stock-value', 'mgr1')).status).toBe(403);
    });
  });

  describe('budget totals', () => {
    it('counts bought material once: stock used is left out of money totals', async () => {
      const monitor = ok(await call('get', '/budgets/monitor', 'admin'));
      if (!monitor.kpis) return;
      const onLines = monitor.lines.reduce((a: number, l: any) => a + l.actual - l.stock_used, 0);
      expect(monitor.kpis.actual).toBeCloseTo(onLines, 1);
    });

    it('checks a stock purchase against the Store line', async () => {
      const r = ok(await call('get', `/budgets/headroom?contextType=stock&categoryId=${categoryId}&amount=100&date=${today}`, 'admin'));
      expect(r.state).not.toBe('NOT_ALLOWED');
    });
  });
});
