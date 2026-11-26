import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// The managers list and a user's permissions: who is listed, who sees email addresses,
// and saving permissions twice updates the one row instead of adding a second.
describe('Managers list and permissions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string;
  let employee: string;
  let empId: number;
  let before: { permissions: unknown; singleLimit: unknown; monthlyLimit: unknown; dataScope: string | null } | null;

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
    employee = await login('emp1', 'Test@1234');
    empId = (await prisma.user.findFirstOrThrow({ where: { username: 'emp4' } })).id;
    before = await prisma.userPermission.findUnique({ where: { userId: empId } });
  }, 60000);

  afterAll(async () => {
    // Put the test user's permissions back the way they were
    if (before) await prisma.userPermission.update({ where: { userId: empId }, data: { permissions: before.permissions as object, singleLimit: before.singleLimit as number, monthlyLimit: before.monthlyLimit as number, dataScope: before.dataScope } });
    else await prisma.userPermission.deleteMany({ where: { userId: empId } });
    await app.close();
  });

  describe('managers list', () => {
    it('lists only active managers and admins, in name order', async () => {
      const r = await get(admin, '/users/by-role/managers');
      expect(r.status).toBe(200);
      const names = r.body.data.map((u: any) => u.username);
      expect(names).toEqual([...names].sort());
      expect(r.body.data.every((u: any) => ['MANAGER', 'ADMIN'].includes(u.role_name))).toBe(true);
      expect(names).toContain('admin');
      expect(names).toContain('mgr1');
      expect(names).not.toContain('emp1');
      const ids = r.body.data.map((u: any) => u.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('shows email addresses to an admin only', async () => {
      const asAdmin = await get(admin, '/users/by-role/managers');
      expect(asAdmin.body.data.every((u: any) => typeof u.email === 'string')).toBe(true);
      const asEmployee = await get(employee, '/users/by-role/managers');
      expect(asEmployee.status).toBe(200);
      expect(asEmployee.body.data.every((u: any) => u.email === undefined)).toBe(true);
    });
  });

  describe('saving permissions', () => {
    it('creates or updates the one row for the user and returns what was saved', async () => {
      const first = await put(admin, `/users/${empId}/permissions`, { permissions: { expense: ['view'] }, single_limit: 1234, monthly_limit: 5678, data_scope: 'Own' });
      expect(first.status).toBe(200);
      expect(first.body.data).toMatchObject({ permissions: { expense: ['view'] }, single_limit: 1234, monthly_limit: 5678, data_scope: 'Self' });

      const second = await put(admin, `/users/${empId}/permissions`, { permissions: { expense: ['view', 'create'] }, single_limit: 4321, monthly_limit: 8765, data_scope: 'Department' });
      expect(second.status).toBe(200);
      expect(second.body.data).toMatchObject({ permissions: { expense: ['view', 'create'] }, single_limit: 4321, monthly_limit: 8765, data_scope: 'Department' });

      expect(await prisma.userPermission.count({ where: { userId: empId } })).toBe(1);
    });

    it('falls back to the defaults for limits that are left out', async () => {
      const r = await put(admin, `/users/${empId}/permissions`, { permissions: {} });
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ permissions: {}, single_limit: 10000, monthly_limit: 50000, data_scope: 'Department' });
    });
  });
});
