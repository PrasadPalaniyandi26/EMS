import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// Settings and System: the audit log filters and checks its input, a user's own profile is checked,
// the password is never logged, and bad budget settings save nothing.
describe('Settings and system (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string;
  let finance: string;
  let employee: string;

  const login = async (username: string, password: string) => {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password });
    if (!r.body?.data?.accessToken) throw new Error(`Login failed for ${username}`);
    return r.body.data.accessToken as string;
  };
  const get = (t: string, url: string) => request(app.getHttpServer()).get(`/api/v1${url}`).set('Authorization', `Bearer ${t}`);
  const put = (t: string, url: string, body: object) => request(app.getHttpServer()).put(`/api/v1${url}`).set('Authorization', `Bearer ${t}`).send(body);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    admin = await login('admin', 'admin123');
    finance = await login('fin1', 'Test@1234');
    employee = await login('emp1', 'Test@1234');
  }, 60000);

  afterAll(async () => { await app.close(); });

  describe('audit log', () => {
    it('is closed to employees and open to finance', async () => {
      expect((await get(employee, '/audit')).status).toBe(403);
      expect((await get(finance, '/audit')).status).toBe(200);
    });

    it('refuses a bad date, a backwards period and a bad user filter', async () => {
      expect((await get(admin, '/audit?dateFrom=nope')).status).toBe(400);
      expect((await get(admin, '/audit?dateFrom=2026-05-31&dateTo=2026-05-01')).status).toBe(400);
      expect((await get(admin, '/audit?userId=abc')).status).toBe(400);
    });

    it('caps the page size', async () => {
      const r = await get(admin, '/audit?limit=100000');
      expect(r.status).toBe(200);
      expect(r.body.data.length ?? r.body.data.rows?.length ?? 0).toBeLessThanOrEqual(200);
    });

    it('includes everything logged on the end date', async () => {
      const row = await prisma.auditLog.create({ data: { tableName: 'zz_test', recordId: 1, action: 'UPDATE', changedBy: (await prisma.user.findFirstOrThrow({ where: { username: 'admin' } })).id, changedAt: new Date('2018-05-10T18:30:00Z') } });
      try {
        const r = await get(admin, '/audit?tableName=zz_test&dateFrom=2018-05-10&dateTo=2018-05-10');
        expect(r.status).toBe(200);
        expect(r.body.data).toBeDefined();
        const rows = (r.body.data.rows ?? r.body.data) as any[];
        expect(rows.some((x) => x.id === row.id)).toBe(true);
      } finally {
        await prisma.auditLog.delete({ where: { id: row.id } });
      }
    });

    it('counts older CREATE entries as Created', async () => {
      const adminId = (await prisma.user.findFirstOrThrow({ where: { username: 'admin' } })).id;
      const row = await prisma.auditLog.create({ data: { tableName: 'zz_test', recordId: 2, action: 'CREATE', changedBy: adminId } });
      try {
        const r = await get(admin, '/audit?tableName=zz_test&action=INSERT');
        const rows = (r.body.data.rows ?? r.body.data) as any[];
        expect(rows.some((x) => x.id === row.id)).toBe(true);
      } finally {
        await prisma.auditLog.delete({ where: { id: row.id } });
      }
    });
  });

  describe('your own profile', () => {
    it('refuses a bad name, username, phone or password', async () => {
      expect((await put(employee, '/users/me/profile', { username: '   ' })).status).toBe(400);
      expect((await put(employee, '/users/me/profile', { login_name: 'has space' })).status).toBe(400);
      expect((await put(employee, '/users/me/profile', { contact_no: 'call me' })).status).toBe(400);
      expect((await put(employee, '/users/me/profile', { password: '123', currentPassword: 'Test@1234' })).status).toBe(400);
    });

    it('needs the right current password, and says so with a 400', async () => {
      const r = await put(employee, '/users/me/profile', { password: 'Another@123', currentPassword: 'wrong' });
      expect(r.status).toBe(400);
      expect(r.body.error?.message ?? r.body.message).toMatch(/incorrect/i);
    });

    it('never logs the password, but logs that it changed', async () => {
      const emp = await prisma.user.findFirstOrThrow({ where: { username: 'emp2' } });
      const token = await login('emp2', 'Test@1234');
      const before = await prisma.auditLog.count({ where: { tableName: 'users', recordId: emp.id } });
      const r = await put(token, '/users/me/profile', { password: 'Test@1234', currentPassword: 'Test@1234' });
      expect(r.status).toBe(200);
      const logs = await prisma.auditLog.findMany({ where: { tableName: 'users', recordId: emp.id }, orderBy: { id: 'desc' }, take: 1 });
      expect(await prisma.auditLog.count({ where: { tableName: 'users', recordId: emp.id } })).toBe(before + 1);
      expect(logs[0].newValues).toContain('password_changed');
      expect(JSON.stringify(logs[0])).not.toMatch(/\$2[aby]\$/);
    });
  });

  describe('budget settings', () => {
    it('saves nothing when one alert rule is wrong', async () => {
      const cur = await get(admin, '/budgets/settings');
      expect(cur.status).toBe(200);
      const rules = cur.body.data.rules as any[];
      const withThreshold = rules.find((r) => r.threshold != null);
      const bad = [{ code: rules[0].code, enabled: !rules[0].enabled, threshold: rules[0].threshold }, { code: withThreshold.code, enabled: true, threshold: -5 }];
      const r = await put(admin, '/budgets/settings', { rules: bad });
      expect(r.status).toBe(400);
      const after = await get(admin, '/budgets/settings');
      expect(after.body.data.rules[0].enabled).toBe(rules[0].enabled);
    });

    it('refuses an alert rule that does not exist', async () => {
      expect((await put(admin, '/budgets/settings', { rules: [{ code: 'NOT_A_RULE', enabled: true }] })).status).toBe(400);
    });

    it('is closed to employees for saving', async () => {
      expect((await put(employee, '/budgets/settings', {})).status).toBe(403);
    });
  });
});
