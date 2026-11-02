import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

// Part master on the real database: create, edit, alternates, replace and retire, BOM versions, delete rules, history and import.
// Test parts use the ZZ- prefix and are removed before and after the run. Product 7 is used for BOM checks and must have no BOM beforehand.
const TEST_PRODUCT = 7;

type Res = { status: number; body: any };

describe('Part master (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: string;
  let employee: string;

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
    await prisma.partReplacement.deleteMany({ where: { OR: [{ item: { partNo: { startsWith: 'ZZ-' } } }, { successor: { partNo: { startsWith: 'ZZ-' } } }] } });
    await prisma.bomLine.deleteMany({ where: { bom: { productId: TEST_PRODUCT } } });
    await prisma.bom.deleteMany({ where: { productId: TEST_PRODUCT } });
    await prisma.itemPriceLog.deleteMany({ where: { item: { partNo: { startsWith: 'ZZ-' } } } });
    await prisma.item.updateMany({ where: { partNo: { startsWith: 'ZZ-' } }, data: { alternateGroupId: null, isDefaultAlternate: false } });
    await prisma.item.deleteMany({ where: { partNo: { startsWith: 'ZZ-' } } });
  };
  const allParts = async () => data(await call('get', '/budgets/items?all=1', admin)) as any[];
  const part = async (partNo: string) => (await allParts()).find((i) => i.part_no === partNo);
  const create = (body: Record<string, unknown>) => call('post', '/budgets/items', admin, body);
  // The server dates in its own time zone, so the tests do too (UTC can already be the next day)
  const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => localDate(new Date());
  const tomorrow = () => localDate(new Date(Date.now() + 86400000));

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
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('create', () => {
    it('a bought part needs an OEM part number', async () => {
      expect((await create({ part_no: 'ZZ-C', name: 'C', sourcing: 'BUY', standard_price: 9, uom: 'nos' })).status).toBe(400);
      expect((await create({ part_no: 'ZZ-C', name: 'C', sourcing: 'BUY', standard_price: 9, uom: 'nos', oem_part_no: '   ' })).status).toBe(400);
      expect((await create({ part_no: 'ZZ-C', name: 'C', sourcing: 'BUY', standard_price: 9, uom: 'nos', oem_part_no: 'X'.repeat(61) })).status).toBe(400);
    });

    it('a made part keeps no OEM part number', async () => {
      expect((await create({ part_no: 'ZZ-M', name: 'M', sourcing: 'MAKE', material_cost: 5, manufacturing_cost: 3, uom: 'nos', oem_part_no: 'IGNORED' })).status).toBe(201);
      expect((await part('ZZ-M')).oem_part_no).toBeNull();
    });

    it('part numbers are unique regardless of case, and prices must be sane', async () => {
      await create({ part_no: 'ZZ-A', name: 'A', sourcing: 'BUY', standard_price: 10, uom: 'nos', oem_part_no: 'OEM-A' });
      expect((await create({ part_no: 'zz-a', name: 'dup', sourcing: 'BUY', standard_price: 1, uom: 'nos', oem_part_no: 'X' })).status).toBe(409);
      expect((await create({ part_no: 'ZZ-N', name: 'neg', sourcing: 'BUY', standard_price: -1, uom: 'nos', oem_part_no: 'X' })).status).toBe(400);
    });

    it('only Finance and Admin can create parts', async () => {
      expect((await call('post', '/budgets/items', employee, { part_no: 'ZZ-E', name: 'E', sourcing: 'BUY', standard_price: 1, uom: 'nos', oem_part_no: 'X' })).status).toBe(403);
    });
  });

  describe('edit', () => {
    it('edits an active part, but a bought part cannot lose its OEM number', async () => {
      const a = await part('ZZ-A');
      expect((await call('put', `/budgets/items/${a.id}`, admin, { part_no: 'ZZ-A', name: 'A2', sourcing: 'BUY', standard_price: 11, uom: 'nos', oem_part_no: 'OEM-A' })).status).toBe(200);
      expect((await call('put', `/budgets/items/${a.id}`, admin, { part_no: 'ZZ-A', name: 'A2', sourcing: 'BUY', standard_price: 11, uom: 'nos', oem_part_no: '' })).status).toBe(400);
      expect((await part('ZZ-A')).part_no).toBe('ZZ-A');
    });
  });

  describe('alternates', () => {
    it('groups bought parts of one unit, with one default', async () => {
      const a = await part('ZZ-A');
      await create({ part_no: 'ZZ-B', name: 'B', sourcing: 'BUY', standard_price: 12, uom: 'nos', oem_part_no: 'oem-a' });
      const b = await part('ZZ-B');
      expect((await call('post', `/budgets/items/${a.id}/alternates`, admin, { alternate_id: b.id })).status).toBe(201);
      expect((await call('post', `/budgets/items/${a.id}/alternates`, admin, { alternate_id: b.id })).status).toBe(409);
      expect((await call('post', `/budgets/items/${a.id}/alternates`, admin, { alternate_id: a.id })).status).toBe(400);
      await create({ part_no: 'ZZ-M2', name: 'made', sourcing: 'MAKE', material_cost: 1, manufacturing_cost: 1, uom: 'nos' });
      expect((await call('post', `/budgets/items/${a.id}/alternates`, admin, { alternate_id: (await part('ZZ-M2')).id })).status).toBe(400);
      expect((await part('ZZ-A')).is_default_alternate).toBe(true);
      expect((await part('ZZ-B')).alternates.map((x: any) => x.part_no)).toEqual(['ZZ-A']);
    });

    it('a different unit cannot join the group, and a unit change is refused while grouped', async () => {
      const a = await part('ZZ-A');
      await create({ part_no: 'ZZ-U', name: 'Cable', sourcing: 'BUY', standard_price: 3, uom: 'm', oem_part_no: 'OEM-U' });
      expect((await call('post', `/budgets/items/${a.id}/alternates`, admin, { alternate_id: (await part('ZZ-U')).id })).status).toBe(400);
      expect((await call('put', `/budgets/items/${a.id}`, admin, { part_no: 'ZZ-A', name: 'A2', sourcing: 'BUY', standard_price: 11, uom: 'm', oem_part_no: 'OEM-A' })).status).toBe(409);
    });

    it('the default moves, and a group of one dissolves', async () => {
      const a = await part('ZZ-A'); const b = await part('ZZ-B');
      expect((await call('put', `/budgets/items/${b.id}/default-alternate`, admin, {})).status).toBe(200);
      expect((await part('ZZ-A')).is_default_alternate).toBe(false);
      expect((await part('ZZ-B')).is_default_alternate).toBe(true);
      expect((await call('put', `/budgets/items/${(await part('ZZ-M2')).id}/default-alternate`, admin, {})).status).toBe(409);
      expect((await call('delete', `/budgets/items/${b.id}/alternates`, admin)).status).toBe(200);
      expect((await part('ZZ-A')).alternates).toEqual([]);
      expect((await call('post', `/budgets/items/${a.id}/alternates`, admin, { alternate_id: b.id })).status).toBe(201);
    });
  });

  describe('BOM use, delete and replace', () => {
    it('a used part cannot be deleted; an unused part can', async () => {
      const a = await part('ZZ-A');
      expect((await call('post', `/budgets/products/${TEST_PRODUCT}/bom-lines`, admin, { item_id: a.id, quantity: 2, scrap_pct: 5 })).status).toBe(201);
      expect((await call('delete', `/budgets/items/${a.id}`, admin)).status).toBe(409);
      expect((await part('ZZ-A')).used_in).toBe(1);
      expect((await call('delete', `/budgets/items/${(await part('ZZ-M2')).id}`, admin)).status).toBe(200);
    });

    it('replacement is validated: reason, date, self, unit, role', async () => {
      const a = await part('ZZ-A'); const b = await part('ZZ-B');
      expect((await call('post', `/budgets/items/${a.id}/replace`, admin, { successor_id: b.id, effective_from: today(), reason: '' })).status).toBe(400);
      expect((await call('post', `/budgets/items/${a.id}/replace`, admin, { successor_id: b.id, effective_from: '2020-01-01', reason: 'x' })).status).toBe(400);
      expect((await call('post', `/budgets/items/${a.id}/replace`, admin, { successor_id: a.id, effective_from: today(), reason: 'x' })).status).toBe(400);
      expect((await call('post', `/budgets/items/${a.id}/replace`, employee, { successor_id: b.id, effective_from: today(), reason: 'x' })).status).toBe(403);
      expect((await call('post', `/budgets/items/${a.id}/replace`, admin, { successor_id: (await part('ZZ-U')).id, effective_from: today(), reason: 'x' })).status).toBe(400);
    });

    it('a future replacement is scheduled, blocks a second one, and can be cancelled once', async () => {
      const a = await part('ZZ-A'); const c = await create({ part_no: 'ZZ-C2', name: 'C2', sourcing: 'BUY', standard_price: 8, uom: 'nos', oem_part_no: 'OEM-C2' }).then(() => part('ZZ-C2'));
      const r = await call('post', `/budgets/items/${a.id}/replace`, admin, { successor_id: c.id, effective_from: tomorrow(), reason: 'Planned' });
      expect(r.status).toBe(201);
      expect(data(r).applied).toBe(false);
      const scheduled = await part('ZZ-A');
      expect(scheduled.status).toBe('ACTIVE');
      expect(scheduled.scheduled.successor_part_no).toBe('ZZ-C2');
      expect((await call('post', `/budgets/items/${a.id}/replace`, admin, { successor_id: c.id, effective_from: tomorrow(), reason: 'again' })).status).toBe(409);
      expect((await call('delete', `/budgets/part-replacements/${scheduled.scheduled.id}`, admin)).status).toBe(200);
      expect((await call('delete', `/budgets/part-replacements/${scheduled.scheduled.id}`, admin)).status).toBe(409);
      expect((await part('ZZ-A')).status).toBe('ACTIVE');
    });

    it('replacing today takes effect at once: new BOM version, replaced part read-only, number never reused', async () => {
      const a = await part('ZZ-A'); const c = await part('ZZ-C2');
      const r = await call('post', `/budgets/items/${a.id}/replace`, admin, { successor_id: c.id, effective_from: today(), reason: 'Supplier discontinued' });
      expect(r.status).toBe(201);
      expect(data(r).applied).toBe(true);
      const replaced = await part('ZZ-A');
      expect(replaced.status).toBe('REPLACED');
      expect(replaced.replaced_by_part_no).toBe('ZZ-C2');
      expect((await call('post', `/budgets/items/${a.id}/replace`, admin, { successor_id: c.id, effective_from: today(), reason: 'again' })).status).toBe(409);
      expect((await call('put', `/budgets/items/${a.id}`, admin, { part_no: 'ZZ-A', name: 'x', sourcing: 'BUY', standard_price: 1, uom: 'nos', oem_part_no: 'OEM-A' })).status).toBe(409);
      expect((await create({ part_no: 'ZZ-A', name: 'reuse', sourcing: 'BUY', standard_price: 1, uom: 'nos', oem_part_no: 'OEM-A' })).status).toBe(409);
      expect((await call('delete', `/budgets/items/${a.id}`, admin)).status).toBe(409);
      const versions = await prisma.bom.findMany({ where: { productId: TEST_PRODUCT }, orderBy: { version: 'asc' }, include: { lines: true } });
      const partNo = new Map((await prisma.item.findMany({ select: { id: true, partNo: true } })).map((i) => [i.id, i.partNo]));
      expect(versions.length).toBeGreaterThanOrEqual(2);
      expect(versions[versions.length - 1].lines.map((l) => partNo.get(l.itemId!))).toEqual(['ZZ-C2']);
      expect(versions[0].lines.map((l) => partNo.get(l.itemId!))).toEqual(['ZZ-A']);
    });

    it('retiring with no successor removes the line from the latest BOM version', async () => {
      const c = await part('ZZ-C2');
      expect((await call('post', `/budgets/items/${c.id}/replace`, admin, { effective_from: today(), reason: 'No longer made' })).status).toBe(201);
      expect((await part('ZZ-C2')).status).toBe('RETIRED');
      const latest = await prisma.bom.findFirst({ where: { productId: TEST_PRODUCT }, orderBy: { version: 'desc' }, include: { lines: true } });
      expect(latest).not.toBeNull();
      expect(latest!.lines.length).toBe(0);
    });
  });

  describe('lists and history', () => {
    it('pickers see active parts only; the Part master sees all', async () => {
      const active = data(await call('get', '/budgets/items', admin)) as any[];
      const every = await allParts();
      expect(active.every((i) => i.status === 'ACTIVE')).toBe(true);
      expect(every.filter((i) => i.status !== 'ACTIVE').length).toBeGreaterThanOrEqual(2);
    });

    it('history records edits, alternates and replacements', async () => {
      const a = await part('ZZ-A');
      const events = data(await call('get', `/budgets/items/${a.id}/history`, admin)) as any[];
      const kinds = new Set(events.map((e) => e.kind));
      expect(kinds.has('REPLACEMENT')).toBe(true);
      expect(kinds.has('ALTERNATE')).toBe(true);
      expect(kinds.has('ADDED')).toBe(true);
    });
  });

  describe('project-only parts', () => {
    const JOB_PROJECT = 10;

    it('is created from the job BOM, listed for that project and the Part master only', async () => {
      const made = await call('post', `/budgets/projects/${JOB_PROJECT}/job-bom/parts`, admin, { part_no: 'ZZ-P1', name: 'One-off', sourcing: 'BUY', standard_price: 50, uom: 'nos', oem_part_no: 'OEM-P1' });
      expect(made.status).toBe(201);
      expect((await part('ZZ-P1')).project_id).toBe(JOB_PROJECT);
      expect((data(await call('get', '/budgets/items', admin)) as any[]).some((i) => i.part_no === 'ZZ-P1')).toBe(false);
      expect((data(await call('get', `/budgets/projects/${JOB_PROJECT}/job-bom`, admin)).items as any[]).some((i) => i.part_no === 'ZZ-P1')).toBe(true);
      expect((data(await call('get', `/budgets/products/${TEST_PRODUCT}`, admin)).items as any[]).some((i) => i.part_no === 'ZZ-P1')).toBe(false);
    });

    it('cannot go on a product BOM, and cannot be an alternate', async () => {
      const p = await part('ZZ-P1');
      expect((await call('post', `/budgets/products/${TEST_PRODUCT}/bom-lines`, admin, { item_id: p.id, quantity: 1 })).status).toBe(409);
      expect((await create({ part_no: 'ZZ-P2', name: 'Global', sourcing: 'BUY', standard_price: 50, uom: 'nos', oem_part_no: 'OEM-P2' })).status).toBe(201);
      expect((await call('post', `/budgets/items/${(await part('ZZ-P2')).id}/alternates`, admin, { alternate_id: p.id })).status).toBe(400);
    });

    it('keeps its project when edited', async () => {
      const p = await part('ZZ-P1');
      expect((await call('put', `/budgets/items/${p.id}`, admin, { part_no: 'ZZ-P1', name: 'One-off 2', sourcing: 'BUY', standard_price: 55, uom: 'nos', oem_part_no: 'OEM-P1', project_id: null })).status).toBe(200);
      expect((await part('ZZ-P1')).project_id).toBe(JOB_PROJECT);
    });
  });

  describe('import', () => {
    it('a bought row without an OEM number is an error; a valid one passes the dry run', async () => {
      const bad = data(await call('post', '/budgets/items/import', admin, { dry_run: true, rows: [{ part_no: 'ZZ-IMP1', name: 'no oem', make_or_buy: 'Buy', uom: 'nos', standard_price: '10' }] }));
      expect(bad.errors.length).toBe(1);
      expect(bad.applied).toBe(false);
      const good = data(await call('post', '/budgets/items/import', admin, { dry_run: true, rows: [{ part_no: 'ZZ-IMP2', name: 'ok', make_or_buy: 'Buy', uom: 'nos', standard_price: '10', oem_part_no: 'I-2' }] }));
      expect(good.errors.length).toBe(0);
      expect(good.created).toBe(1);
    });

    it('a retired part number is refused by import, not updated', async () => {
      const r = data(await call('post', '/budgets/items/import', admin, { dry_run: false, rows: [{ part_no: 'ZZ-A', name: 'again', make_or_buy: 'Buy', uom: 'nos', standard_price: '10', oem_part_no: 'OEM-A' }] }));
      expect(r.applied).toBe(false);
    });
  });
});
