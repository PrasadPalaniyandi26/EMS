import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { RecurringService } from './../src/recurring/recurring.service';
import { BuildOrdersService } from './../src/budgets/build-orders.service';
import { StockService } from './../src/stock/stock.service';
import { today as businessToday } from './../src/common/helpers/dates';

// Bugs found by the whole-repo review of 26 Nov 2026. Each test fails on the code as it was reviewed.
// Test data starts with "ZZfix" or uses plan year 2094, and is removed before and after the run.
type Res = { status: number; body: any };

describe('Correctness fixes (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  const FY = 2094;
  const OLD_YEAR = 2002;

  const call = async (method: 'get' | 'post' | 'put' | 'delete', url: string, who: string, body?: unknown): Promise<Res> => {
    const r = request(app.getHttpServer())[method](`/api/v1${url}`).set('Authorization', `Bearer ${tokens[who]}`);
    const out = body === undefined ? await r : await r.send(body as object);
    return { status: out.status, body: out.body };
  };
  const both = async (a: Promise<Res>, b: Promise<Res>) => (await Promise.all([a, b])).map((r) => (r.status < 300 ? 'done' : String(r.status))).sort();

  const cleanup = async () => {
    const lines = (await prisma.budgetLine.findMany({ where: { plan: { fy: FY } }, select: { id: true } })).map((l) => l.id);
    await prisma.budgetChange.deleteMany({ where: { reason: { startsWith: 'ZZfix' } } });
    await prisma.budgetLinePeriod.deleteMany({ where: { lineId: { in: lines } } });
    await prisma.budgetLine.deleteMany({ where: { id: { in: lines } } });
    await prisma.budgetPlan.deleteMany({ where: { fy: FY } });
    await prisma.stockCount.deleteMany({ where: { year: OLD_YEAR } });
    await prisma.recurringTransaction.deleteMany({ where: { description: { startsWith: 'ZZfix' } } });
    await prisma.buildOrder.deleteMany({ where: { code: { startsWith: 'ZZFIX' } } });
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
    for (const who of ['admin', 'fin1', 'fin2', 'emp1']) {
      const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username: who, password: who === 'admin' ? 'admin123' : 'Test@1234' });
      tokens[who] = r.body.data.accessToken;
    }
  }, 60000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('keeps a month-end schedule on the month end after a short month', () => {
    const service = app.get(RecurringService) as any;
    const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
    const next = (from: string, frequency: string, started: string) => service.calculateNext(day(from), frequency, day(started)).toISOString().slice(0, 10);
    expect(next('2027-01-31', 'monthly', '2027-01-31')).toBe('2027-02-28');
    expect(next('2027-02-28', 'monthly', '2027-01-31')).toBe('2027-03-31');
    expect(next('2027-02-28', 'quarterly', '2026-11-30')).toBe('2027-05-30');
    // A schedule really due on the 28th stays on the 28th, and one moved off the month end stays where it was moved
    expect(next('2027-02-28', 'monthly', '2027-01-28')).toBe('2027-03-28');
    expect(next('2027-02-15', 'monthly', '2027-01-31')).toBe('2027-03-15');
  });

  it('refuses a recurring schedule with a bad amount, date or frequency', async () => {
    const category_id = (await prisma.category.findFirstOrThrow({ where: { isActive: true, type: 'expense' } })).id;
    const good = { amount: 500, category_id, description: 'ZZfix schedule', frequency: 'monthly', next_run: '2027-01-15', payment_method: 'card' };
    for (const bad of [{ amount: -500 }, { amount: 0 }, { amount: 'abc' }, { next_run: 'soon' }, { next_run: undefined }, { frequency: 'hourly' }, { category_id: undefined }]) {
      expect((await call('post', '/recurring', 'emp1', { ...good, ...bad })).status).toBe(400);
    }
    const made = await call('post', '/recurring', 'emp1', good);
    expect(made.status).toBe(201);
    expect((await call('put', `/recurring/${made.body.data.id}`, 'emp1', { ...good, amount: -1 })).status).toBe(400);
  });

  it('keeps both of two budget changes approved at the same moment', async () => {
    expect((await call('post', '/budgets/plans', 'admin', { fy: FY, name: 'ZZfix plan' })).status).toBe(201);
    const planId = (await prisma.budgetPlan.findUniqueOrThrow({ where: { fy: FY } })).id;
    const line = (await call('post', '/budgets/lines', 'admin', { plan_id: planId, cost_object: 'RESERVE', periods: Array(12).fill(100) })).body.data.id as number;
    for (let round = 0; round < 4; round++) {
      const ask = async (amount: number) => (await call('post', '/budgets/changes', 'admin', { kind: 'REVISION', to_line_id: line, amount, reason: 'ZZfix more' })).body.data.id as number;
      const [a, b] = [await ask(10), await ask(20)];
      expect(await both(call('post', `/budgets/changes/${a}/decision`, 'fin1', { decision: 'approve' }), call('post', `/budgets/changes/${b}/decision`, 'fin2', { decision: 'approve' }))).toEqual(['done', 'done']);
    }
    const total = (await prisma.budgetLinePeriod.findMany({ where: { lineId: line } })).reduce((s, p) => s + Number(p.amount), 0);
    expect(total).toBe(1200 + 4 * 30);
  });

  it("refuses a budget month outside the plan's year", async () => {
    const line = await prisma.budgetLine.findFirstOrThrow({ where: { plan: { fy: FY } } });
    expect((await call('put', `/budgets/lines/${line.id}/period`, 'admin', { year: 2099, month: 1, amount: 5000 })).status).toBe(400);
    expect((await call('put', `/budgets/lines/${line.id}/period`, 'admin', { year: FY, month: 13, amount: 5000 })).status).toBe(400);
    expect(await prisma.budgetLinePeriod.count({ where: { lineId: line.id } })).toBe(12);
  });

  it('cannot send back a stock count that has just been approved', async () => {
    const service = app.get(StockService) as any;
    const real = service.countOrThrow.bind(service);
    const c = await prisma.stockCount.create({ data: { year: OLD_YEAR, month: 1, status: 'SUBMITTED' } });
    let reached!: () => void;
    const read = new Promise<void>((resolve) => { reached = resolve; });
    // The send-back reads the count as submitted, then is slow to write
    jest.spyOn(service, 'countOrThrow').mockImplementationOnce((async (id: number) => { const row = await real(id); reached(); await new Promise((r) => setTimeout(r, 700)); return row; }) as never);
    const sendingBack = call('post', `/stock/counts/${c.id}/decision`, 'fin1', { decision: 'send_back', note: 'ZZfix count again' }).then((r) => r);
    await read;
    expect((await call('post', `/stock/counts/${c.id}/decision`, 'fin2', { decision: 'approve' })).status).toBe(201);
    expect((await sendingBack).status).toBe(409);
    expect((await prisma.stockCount.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('APPROVED');
  });

  it('does not let an order edit land after the order was cancelled', async () => {
    const product = await prisma.product.findFirstOrThrow({ where: { isActive: true, isSystem: false } });
    const client = await prisma.client.findFirstOrThrow({ where: { isActive: true, isSystem: false } });
    const admin = await prisma.user.findFirstOrThrow({ where: { loginName: 'admin' } });
    const order = await prisma.buildOrder.create({ data: { code: 'ZZFIX-1', productId: product.id, clientId: client.id, quantity: 2, startDate: businessToday(), deliveryDate: new Date(businessToday().getTime() + 90 * 86400000), createdBy: admin.id } });
    const service = app.get(BuildOrdersService) as any;
    const real = service.openOrder.bind(service);
    let reached!: () => void;
    const checked = new Promise<void>((resolve) => { reached = resolve; });
    // The edit passes its "still open" check, then is slow to write
    jest.spyOn(service, 'openOrder').mockImplementationOnce((async (id: number) => { const o = await real(id); reached(); await new Promise((r) => setTimeout(r, 700)); return o; }) as never);
    const done: string[] = [];
    const user = { id: admin.id, username: admin.username, role_name: 'ADMIN' };
    const editing = service.update(order.id, { quantity: 9 }, user).then(() => done.push('edit'), () => done.push('edit refused'));
    await checked;
    await service.move(order.id, 'cancel', { reason: 'ZZfix cancel' }, user).then(() => done.push('cancel'));
    await editing;
    expect(done).toEqual(['edit', 'cancel']);
  });

  it('answers a bad date filter with a message, not a server error', async () => {
    for (const url of ['/transactions?dateFrom=soon', '/transactions/export?dateTo=2026-99-99', '/transactions/reimbursements?dateFrom=x']) {
      expect((await call('get', url, 'fin1')).status).toBe(400);
    }
  });
});
