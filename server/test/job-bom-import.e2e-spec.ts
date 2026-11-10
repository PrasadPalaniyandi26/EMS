import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// Starting a job BOM from a standard product: replace or add, the copy stays editable, the source is remembered,
// and the group and sequence of each part carry over. Test data uses the ZZ prefix and is removed before and after the run.
type Res = { status: number; body: any };

describe('Job BOM import (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string;
  let employee: string;
  let clientId: number;
  let projectId: number;
  let prodA: number; let prodB: number; let prodGrouped: number; let prodEmpty: number;
  let a1: number; let a2: number; let b1: number; let s1: number;

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

  const cleanup = async () => {
    const pids = (await prisma.project.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((p) => p.id);
    await prisma.costEstimate.deleteMany({ where: { projectId: { in: pids } } });
    await prisma.bom.deleteMany({ where: { projectId: { in: pids } } });
    await prisma.project.deleteMany({ where: { id: { in: pids } } });
    const prods = (await prisma.product.findMany({ where: { name: { startsWith: 'ZZ ' } }, select: { id: true } })).map((p) => p.id);
    await prisma.standardCost.deleteMany({ where: { productId: { in: prods } } });
    await prisma.bomLine.deleteMany({ where: { bom: { productId: { in: prods } } } });
    await prisma.bom.deleteMany({ where: { productId: { in: prods } } });
    await prisma.product.deleteMany({ where: { id: { in: prods } } });
    await prisma.item.updateMany({ where: { partNo: { startsWith: 'ZZ-' } }, data: { alternateGroupId: null } });
    await prisma.item.deleteMany({ where: { partNo: { startsWith: 'ZZ-' } } });
  };
  const newPart = async (partNo: string, price: number) => {
    const r = await call('post', '/budgets/items', admin, { part_no: partNo, name: partNo, sourcing: 'BUY', standard_price: price, uom: 'nos', oem_part_no: `OEM-${partNo}`, lead_time_days: 5 });
    expect(r.status).toBe(201);
    return data(r).id as number;
  };
  const addLine = async (productId: number, body: Record<string, unknown>) => expect((await call('post', `/budgets/products/${productId}/bom-lines`, admin, body)).status).toBe(201);
  const job = async () => data(await call('get', `/budgets/projects/${projectId}/job-bom`, admin));
  const importFrom = (productId: number, mode?: string, token = admin) => call('post', `/budgets/projects/${projectId}/job-bom/import`, token, { product_id: productId, ...(mode ? { mode } : {}) });

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
    const type = await prisma.projectType.findFirstOrThrow({ where: { hasJobBom: true } });
    projectId = (await prisma.project.create({ data: { clientId, name: 'ZZ Job project', typeId: type.id, status: 'Active' } })).id;
    const mk = async (name: string) => (await prisma.product.create({ data: { clientId, name } })).id;
    prodA = await mk('ZZ Product A'); prodB = await mk('ZZ Product B'); prodGrouped = await mk('ZZ Product grouped'); prodEmpty = await mk('ZZ Empty product');
    a1 = await newPart('ZZ-A1', 10); a2 = await newPart('ZZ-A2', 20); b1 = await newPart('ZZ-B1', 7); s1 = await newPart('ZZ-S1', 4);
    await addLine(prodA, { item_id: a1, quantity: 2, scrap_pct: 5 });
    await addLine(prodA, { item_id: a2, quantity: 1 });
    const op = await prisma.operationType.findFirstOrThrow({ where: { isActive: true, isOutsourced: false, isFixed: false } });
    const card = await prisma.rateCard.findFirstOrThrow({ where: { isActive: true } });
    expect((await call('post', `/budgets/products/${prodA}/operations`, admin, { operation_type_id: op.id, rate_card_id: card.id, hours: 3 })).status).toBe(201);
    await addLine(prodB, { item_id: b1, quantity: 4 });
    await addLine(prodGrouped, { item_id: a1, quantity: 1, group_name: 'Arm', sequence: 1 });
    await addLine(prodGrouped, { item_id: s1, quantity: 2, group_name: 'Base', sequence: 2 });
  }, 90000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('needs a product with a BOM and a valid mode, and only managers and above can import', async () => {
    expect((await call('post', `/budgets/projects/${projectId}/job-bom/import`, admin, {})).status).toBe(400);
    expect((await importFrom(prodEmpty)).status).toBe(409);
    expect((await importFrom(prodA, 'merge')).status).toBe(400);
    expect((await importFrom(prodA, undefined, employee)).status).toBe(403);
  });

  it('copies the parts and operations, and remembers where they came from', async () => {
    const r = await importFrom(prodA);
    expect(r.status).toBe(201);
    expect(data(r).parts).toBe(2);
    expect(data(r).operations).toBe(1);
    const j = await job();
    expect(j.lines.map((l: any) => l.part_no).sort()).toEqual(['ZZ-A1', 'ZZ-A2']);
    expect(j.lines.find((l: any) => l.part_no === 'ZZ-A1').scrap_pct).toBe(5);
    expect(j.operations).toHaveLength(1);
    expect(j.source.product_id).toBe(prodA);
    expect(j.source.version).toBe(1);
    expect(j.import_sources.some((s: any) => s.id === prodA && s.lines === 2)).toBe(true);
    expect(j.import_sources.some((s: any) => s.id === prodEmpty)).toBe(false);
  });

  it('stays editable after the import, unlike a build order', async () => {
    const line = (await job()).lines.find((l: any) => l.part_no === 'ZZ-A2');
    expect((await call('put', `/budgets/projects/${projectId}/job-bom/lines/${line.id}`, admin, { item_id: line.item_id, quantity: 9 })).status).toBe(200);
    expect((await job()).lines.find((l: any) => l.part_no === 'ZZ-A2').quantity).toBe(9);
  });

  it('replace removes what was there, including parts added by hand, and the source moves', async () => {
    expect((await call('post', `/budgets/projects/${projectId}/job-bom/lines`, admin, { item_id: s1, quantity: 3 })).status).toBe(201);
    const r = await importFrom(prodB, 'replace');
    expect(r.status).toBe(201);
    expect(data(r).replaced.parts).toBe(3);
    const j = await job();
    expect(j.lines.map((l: any) => l.part_no)).toEqual(['ZZ-B1']);
    expect(j.operations).toHaveLength(0);
    expect(j.source.product_id).toBe(prodB);
  });

  it('add puts the product after what is already on the job BOM', async () => {
    const r = await importFrom(prodA, 'add');
    expect(r.status).toBe(201);
    expect(data(r).replaced).toBeNull();
    const j = await job();
    expect(j.lines.map((l: any) => l.part_no).sort()).toEqual(['ZZ-A1', 'ZZ-A2', 'ZZ-B1']);
    expect(j.operations).toHaveLength(1);
    expect(j.source.product_id).toBe(prodA);
  });

  it('the group and sequence of each part carry into the job BOM', async () => {
    expect((await importFrom(prodGrouped)).status).toBe(201);
    const j = await job();
    const base = j.lines.find((l: any) => l.part_no === 'ZZ-S1');
    expect(base.group_name).toBe('Base');
    expect(base.sequence).toBe(2);
    expect(base.quantity).toBe(2);
    expect(j.lines.find((l: any) => l.part_no === 'ZZ-A1').group_name).toBe('Arm');
  });

  it('the job estimate follows the imported BOM', async () => {
    await importFrom(prodB, 'replace');
    const est = await prisma.estimateLine.findMany({ where: { estimate: { projectId }, basis: 'JOB_BOM' } });
    expect(est.length).toBeGreaterThan(0);
    expect(est.reduce((a, l) => a + Number(l.rate), 0)).toBeGreaterThan(0);
  });
});
