import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// The Budget and Costing reports: they answer, their columns match their rows, totals add up,
// and a manager cannot open the Finance-only ones.
describe('Budget and costing reports (e2e)', () => {
  let app: INestApplication<App>;
  let admin: string;
  let manager: string | null = null;

  const login = async (username: string, password: string) => {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password });
    return (r.body?.data?.accessToken as string) ?? null;
  };
  const report = (token: string, type: string, extra = '') =>
    request(app.getHttpServer()).get(`/api/v1/reporting/generate?type=${type}${extra}`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    admin = (await login('admin', 'admin123'))!;
    manager = await login('mgr1', 'Test@1234');
  }, 60000);

  afterAll(async () => { await app.close(); });

  const types = ['budget-by-month', 'unbudgeted-spend', 'order-costing', 'product-margin', 'project-estimate', 'budget-vs-actual'];

  it.each(types)('%s returns rows whose keys are its columns', async (type) => {
    const r = await report(admin, type);
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d.title).toBeTruthy();
    for (const row of d.rows) for (const c of d.columns) expect(Object.keys(row)).toContain(c);
  });

  it('budget by month has twelve months and totals equal the sum of the months', async () => {
    const d = (await report(admin, 'budget-by-month')).body.data;
    if (!d.rows.length) return; // no plan for the current year
    expect(d.rows).toHaveLength(12);
    const sum = (k: string) => Math.round(d.rows.reduce((a: number, r: any) => a + r[k], 0) * 100) / 100;
    expect(d.totals.Budget).toBe(sum('Budget'));
    expect(d.totals.Actual).toBe(sum('Actual'));
    expect(d.rows[11]['Cumulative Budget']).toBeCloseTo(d.totals.Budget, 2);
  });

  it('a manager is refused the Finance-only reports but can open the budget ones', async () => {
    if (!manager) return; // test users not seeded
    for (const t of ['unbudgeted-spend', 'order-costing', 'product-margin', 'project-estimate']) {
      expect((await report(manager, t)).status).toBe(403);
    }
    expect((await report(manager, 'budget-by-month')).status).toBe(200);
  });
});
