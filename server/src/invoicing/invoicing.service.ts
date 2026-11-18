import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { cleanText } from '../common/helpers/master-data';
import { GSTIN_RE, GST_STATES, IFSC_RE, PAN_RE, invoiceNumber, r2, stateCodeOf, taxOf, totalsOf, type LineOut } from './gst';

type Actor = { id: number; username?: string; role_name?: string };
const bad = (m: string, status: number = HttpStatus.BAD_REQUEST) => new HttpException(m, status);
const n = (v: unknown) => Number(v) || 0;
const DAY = 86400000;
const ISSUED = ['ISSUED', 'PART_PAID', 'PAID'];
const MONEY_MAX = 99_999_999_999;

// A date typed as 2026-11-14 is read as that day, whatever the server's time zone is
function day(v: unknown, label: string): Date {
  const s = String(v ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) throw bad(`Enter the ${label} as a date, for example 2026-11-14.`);
  const d = new Date(s.slice(0, 10) + 'T00:00:00.000Z');
  if (Number.isNaN(d.getTime())) throw bad(`Enter the ${label} as a real date.`);
  return d;
}
const todayUtc = () => { const t = new Date(); return new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())); };
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const money = (v: unknown, label: string, { min = 0, allowZero = true } = {}) => {
  const x = Number(v);
  if (!Number.isFinite(x) || x < min || (!allowZero && x === 0) || x > MONEY_MAX) throw bad(`${label} must be ${allowZero ? 'zero or more' : 'more than zero'}.`);
  return r2(x);
};

@Injectable()
export class InvoicingService {
  private readonly logger = new Logger(InvoicingService.name);
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private log(table: string, recordId: number, action: string, userId: number, ref: string | null, oldValues: unknown, newValues: unknown) {
    this.audit.log({ tableName: table, recordId, referenceId: ref, action, changedBy: userId, oldValues, newValues }).catch((e) => this.logger.warn(`Audit log failed on ${table}`, e?.message));
  }

  // A closed month takes no new invoices, payments or cancellations
  private async assertMonthOpen(date: Date, what: string) {
    const lock = await this.prisma.periodLock.findUnique({ where: { year_month: { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 } } });
    if (lock) throw bad(`${date.getUTCMonth() + 1}/${date.getUTCFullYear()} is closed, so ${what}. Ask an Admin to reopen the month first.`, HttpStatus.CONFLICT);
  }

  // ── Company details ────────────────────────────────────────────────────────

  private mapCompany(c: any) {
    return {
      legal_name: c?.legalName ?? '', gstin: c?.gstin ?? '', pan: c?.pan ?? '', address_line: c?.addressLine ?? '', city: c?.city ?? '', state: c?.state ?? '', postal_code: c?.postalCode ?? '',
      email: c?.email ?? '', phone: c?.phone ?? '', bank_name: c?.bankName ?? '', bank_account: c?.bankAccount ?? '', bank_ifsc: c?.bankIfsc ?? '', terms: c?.terms ?? '', signatory: c?.signatory ?? '',
      configured: !!c, state_code: c ? stateCodeOf(c.gstin, c.state) : null,
    };
  }

  async getCompany() {
    return this.mapCompany(await this.prisma.companyProfile.findUnique({ where: { id: 1 } }));
  }

  async saveCompany(b: any, user: Actor) {
    const upper = (v: unknown) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
    const gstin = upper(b.gstin) || null; const pan = upper(b.pan) || null; const ifsc = upper(b.bank_ifsc) || null;
    if (gstin && !GSTIN_RE.test(gstin)) throw bad('The GSTIN is not valid. It has 15 characters, for example 33ABCDE1234F1Z5.');
    if (pan && !PAN_RE.test(pan)) throw bad('The PAN is not valid. It has 10 characters, for example ABCDE1234F.');
    if (ifsc && !IFSC_RE.test(ifsc)) throw bad('The IFSC is not valid, for example HDFC0001234.');
    const email = cleanText(b.email, 'Email', 200);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Enter a valid email.');
    const phone = cleanText(b.phone, 'Phone', 30);
    if (phone && !/^\+?[0-9\s\-().]{7,20}$/.test(phone)) throw bad('Enter a valid phone, such as +91 98765 43210.');
    const state = cleanText(b.state, 'State', 100);
    if (state && !stateCodeOf(null, state)) throw bad('Choose the state from the list.');
    const data = {
      legalName: cleanText(b.legal_name, 'Legal name', 150, true)!, gstin, pan, addressLine: cleanText(b.address_line, 'Address', 300), city: cleanText(b.city, 'City', 100), state,
      postalCode: cleanText(b.postal_code, 'Postal code', 20), email, phone, bankName: cleanText(b.bank_name, 'Bank name', 100), bankAccount: cleanText(b.bank_account, 'Account number', 30),
      bankIfsc: ifsc, terms: cleanText(b.terms, 'Terms', 1000), signatory: cleanText(b.signatory, 'Signatory', 100),
    };
    if (gstin && state && stateCodeOf(gstin, null) !== stateCodeOf(null, state)) throw bad('The state does not match the first two digits of the GSTIN.');
    const before = await this.prisma.companyProfile.findUnique({ where: { id: 1 } });
    const saved = await this.prisma.companyProfile.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
    this.log('company_profile', 1, before ? 'UPDATE' : 'INSERT', user.id, null, before ? this.mapCompany(before) : null, this.mapCompany(saved));
    return this.mapCompany(saved);
  }

  // ── Client purchase orders ────────────────────────────────────────────────

  private mapPo(p: any, invoiced: number, drafts: number, count: number) {
    const value = n(p.value);
    return {
      id: p.id, client_id: p.clientId, client_name: p.client?.name ?? null, po_number: p.poNumber, po_date: iso(p.poDate), value, valid_until: iso(p.validUntil),
      project_id: p.projectId, project_name: p.project?.name ?? null, build_order_id: p.buildOrderId, build_order_code: p.buildOrder?.code ?? null,
      status: p.status, auto_closed: p.autoClosed, file_path: p.filePath, note: p.note, created_by_name: p.createdByName, created_at: p.createdAt,
      invoiced: r2(invoiced), balance: r2(value - invoiced), draft_count: drafts, invoice_count: count,
      expired: p.status === 'OPEN' && !!p.validUntil && p.validUntil.getTime() < todayUtc().getTime(),
    };
  }

  // Taxable value invoiced so far counts issued invoices; drafts are only counted so the PO can say they exist
  private async poTotals(poIds: number[]) {
    const rows = poIds.length ? await this.prisma.invoice.findMany({ where: { poId: { in: poIds }, status: { not: 'CANCELLED' } }, select: { poId: true, status: true, taxable: true } }) : [];
    const out = new Map<number, { invoiced: number; drafts: number; count: number }>();
    for (const r of rows) {
      const e = out.get(r.poId!) ?? { invoiced: 0, drafts: 0, count: 0 };
      e.count += 1;
      if (r.status === 'DRAFT') e.drafts += 1; else e.invoiced += n(r.taxable);
      out.set(r.poId!, e);
    }
    return out;
  }

  async listPos(q: { clientId?: string; status?: string } = {}) {
    const where: Prisma.ClientPoWhereInput = {};
    if (q.clientId) where.clientId = Number(q.clientId) || -1;
    if (q.status) where.status = String(q.status).toUpperCase();
    const rows = await this.prisma.clientPo.findMany({ where, orderBy: [{ poDate: 'desc' }, { id: 'desc' }], include: { client: { select: { name: true } }, project: { select: { name: true } }, buildOrder: { select: { code: true } } }, take: 2000 });
    const t = await this.poTotals(rows.map((r) => r.id));
    return rows.map((p) => { const x = t.get(p.id); return this.mapPo(p, x?.invoiced ?? 0, x?.drafts ?? 0, x?.count ?? 0); });
  }

  private async getPoRow(id: number) {
    const p = await this.prisma.clientPo.findUnique({ where: { id }, include: { client: { select: { name: true } }, project: { select: { name: true } }, buildOrder: { select: { code: true } } } });
    if (!p) throw bad('Purchase order not found.', HttpStatus.NOT_FOUND);
    return p;
  }

  async getPo(id: number) {
    const p = await this.getPoRow(id);
    const t = (await this.poTotals([id])).get(id);
    const invoices = await this.prisma.invoice.findMany({ where: { poId: id }, orderBy: { id: 'desc' }, select: { id: true, number: true, invoiceDate: true, total: true, taxable: true, status: true } });
    return { ...this.mapPo(p, t?.invoiced ?? 0, t?.drafts ?? 0, t?.count ?? 0), invoices: invoices.map((i) => ({ id: i.id, number: i.number, invoice_date: iso(i.invoiceDate), total: n(i.total), taxable: n(i.taxable), status: i.status })) };
  }

  // The project and order a PO or invoice names must belong to the same client
  private async links(clientId: number, projectId: unknown, buildOrderId: unknown) {
    const pid = projectId ? Number(projectId) : null; const oid = buildOrderId ? Number(buildOrderId) : null;
    if (pid) { const p = await this.prisma.project.findUnique({ where: { id: pid }, select: { clientId: true } }); if (!p || p.clientId !== clientId) throw bad('That project is not for this client.'); }
    if (oid) { const o = await this.prisma.buildOrder.findUnique({ where: { id: oid }, select: { clientId: true } }); if (!o || o.clientId !== clientId) throw bad('That order is not for this client.'); }
    return { projectId: pid, buildOrderId: oid };
  }

  async createPo(b: any, user: Actor) {
    const clientId = Number(b.client_id);
    const client = Number.isInteger(clientId) ? await this.prisma.client.findUnique({ where: { id: clientId } }) : null;
    if (!client || !client.isActive || client.isSystem) throw bad('Choose the client.');
    const poDate = day(b.po_date, 'PO date');
    const validUntil = b.valid_until ? day(b.valid_until, 'valid-until date') : null;
    if (validUntil && validUntil.getTime() < poDate.getTime()) throw bad('The valid-until date cannot be before the PO date.');
    const link = await this.links(clientId, b.project_id, b.build_order_id);
    const data = { clientId, poNumber: cleanText(b.po_number, 'PO number', 60, true)!, poDate, value: money(b.value, 'The PO value', { allowZero: false }), validUntil, ...link, filePath: cleanText(b.file_path, 'File', 255), note: cleanText(b.note, 'Note', 500), createdBy: user.id, createdByName: user.username ?? null };
    try {
      const p = await this.prisma.clientPo.create({ data });
      const out = await this.getPo(p.id);
      this.log('client_pos', p.id, 'INSERT', user.id, p.poNumber, null, out);
      return out;
    } catch (e: any) {
      if (e?.code === 'P2002') throw bad('This client already has a PO with that number.', HttpStatus.CONFLICT);
      throw e;
    }
  }

  async updatePo(id: number, b: any, user: Actor) {
    const cur = await this.getPoRow(id);
    if (cur.status !== 'OPEN') throw bad('Only an open PO can be edited. Reopen it first.', HttpStatus.CONFLICT);
    const totals = (await this.poTotals([id])).get(id);
    const data: Prisma.ClientPoUpdateInput = {};
    if (b.po_number !== undefined) data.poNumber = cleanText(b.po_number, 'PO number', 60, true)!;
    const poDate = b.po_date !== undefined ? day(b.po_date, 'PO date') : cur.poDate;
    if (b.po_date !== undefined) data.poDate = poDate;
    if (b.value !== undefined) {
      const v = money(b.value, 'The PO value', { allowZero: false });
      if (v < (totals?.invoiced ?? 0)) throw bad(`The PO value cannot be less than what has been invoiced against it (${totals?.invoiced}).`);
      data.value = v;
    }
    if (b.valid_until !== undefined) data.validUntil = b.valid_until ? day(b.valid_until, 'valid-until date') : null;
    const vu = data.validUntil !== undefined ? (data.validUntil as Date | null) : cur.validUntil;
    if (vu && vu.getTime() < poDate.getTime()) throw bad('The valid-until date cannot be before the PO date.');
    if (b.project_id !== undefined || b.build_order_id !== undefined) {
      const link = await this.links(cur.clientId, b.project_id !== undefined ? b.project_id : cur.projectId, b.build_order_id !== undefined ? b.build_order_id : cur.buildOrderId);
      data.project = link.projectId ? { connect: { id: link.projectId } } : { disconnect: true };
      data.buildOrder = link.buildOrderId ? { connect: { id: link.buildOrderId } } : { disconnect: true };
    }
    if (b.file_path !== undefined) data.filePath = cleanText(b.file_path, 'File', 255);
    if (b.note !== undefined) data.note = cleanText(b.note, 'Note', 500);
    const before = await this.getPo(id);
    try { await this.prisma.clientPo.update({ where: { id }, data }); } catch (e: any) {
      if (e?.code === 'P2002') throw bad('This client already has a PO with that number.', HttpStatus.CONFLICT);
      throw e;
    }
    const out = await this.getPo(id);
    this.log('client_pos', id, 'UPDATE', user.id, out.po_number, before, out);
    return out;
  }

  async setPoStatus(id: number, action: 'close' | 'reopen' | 'cancel', user: Actor) {
    const cur = await this.getPoRow(id);
    const before = await this.getPo(id);
    if (action === 'close') {
      if (cur.status !== 'OPEN') throw bad('Only an open PO can be closed.', HttpStatus.CONFLICT);
      await this.prisma.clientPo.update({ where: { id }, data: { status: 'CLOSED', autoClosed: false } });
    } else if (action === 'reopen') {
      if (cur.status !== 'CLOSED') throw bad('Only a closed PO can be reopened.', HttpStatus.CONFLICT);
      await this.prisma.clientPo.update({ where: { id }, data: { status: 'OPEN', autoClosed: false } });
    } else {
      if (cur.status === 'CANCELLED') throw bad('This PO is already cancelled.', HttpStatus.CONFLICT);
      const used = await this.prisma.invoice.count({ where: { poId: id, status: { not: 'CANCELLED' } } });
      if (used) throw bad('Invoices still use this PO. Cancel or delete them first.', HttpStatus.CONFLICT);
      await this.prisma.clientPo.update({ where: { id }, data: { status: 'CANCELLED', autoClosed: false } });
    }
    const out = await this.getPo(id);
    this.log('client_pos', id, 'UPDATE', user.id, out.po_number, before, out);
    return out;
  }

  async deletePo(id: number, user: Actor) {
    const cur = await this.getPoRow(id);
    const any = await this.prisma.invoice.count({ where: { poId: id } });
    if (any) throw bad('This PO has invoices against it, so it cannot be deleted. Cancel it instead.', HttpStatus.CONFLICT);
    const before = await this.getPo(id);
    await this.prisma.clientPo.delete({ where: { id } });
    this.log('client_pos', id, 'DELETE', user.id, cur.poNumber, before, null);
    return { deleted: true };
  }

  // A PO that has been invoiced in full closes itself; one that falls below its value again (an invoice cancelled) reopens if it closed itself
  private async settlePo(tx: Prisma.TransactionClient, poId: number | null) {
    if (!poId) return;
    const po = await tx.clientPo.findUnique({ where: { id: poId } });
    if (!po || po.status === 'CANCELLED') return;
    const agg = await tx.invoice.aggregate({ where: { poId, status: { in: ISSUED } }, _sum: { taxable: true } });
    const invoiced = n(agg._sum.taxable);
    if (po.status === 'OPEN' && invoiced >= n(po.value) - 0.005) await tx.clientPo.update({ where: { id: poId }, data: { status: 'CLOSED', autoClosed: true } });
    else if (po.status === 'CLOSED' && po.autoClosed && invoiced < n(po.value) - 0.005) await tx.clientPo.update({ where: { id: poId }, data: { status: 'OPEN', autoClosed: false } });
  }

  // ── Invoices ───────────────────────────────────────────────────────────────

  private INV_INCLUDE = {
    client: { select: { name: true, code: true } }, po: { select: { poNumber: true } }, project: { select: { name: true } }, buildOrder: { select: { code: true } },
    lines: { orderBy: { sequence: 'asc' as const } }, payments: { orderBy: [{ paidOn: 'asc' as const }, { id: 'asc' as const }] },
  };

  private mapInvoice(i: any) {
    const total = n(i.total); const paid = n(i.paid); const tds = n(i.tds);
    const balance = i.status === 'CANCELLED' || i.status === 'DRAFT' ? 0 : r2(total - paid - tds);
    const due = i.dueDate as Date;
    const overdue = ['ISSUED', 'PART_PAID'].includes(i.status) && balance > 0.005 && due.getTime() < todayUtc().getTime();
    return {
      id: i.id, number: i.number, client_id: i.clientId, client_name: i.client?.name ?? null, po_id: i.poId, po_number: i.po?.poNumber ?? null,
      project_id: i.projectId, project_name: i.project?.name ?? null, build_order_id: i.buildOrderId, build_order_code: i.buildOrder?.code ?? null,
      invoice_date: iso(i.invoiceDate), due_date: iso(due), supply_type: i.supplyType, place_of_supply: i.placeOfSupply,
      taxable: n(i.taxable), cgst: n(i.cgst), sgst: n(i.sgst), igst: n(i.igst), round_off: n(i.roundOff), total, paid, tds, balance,
      status: i.status, overdue, days_overdue: overdue ? Math.floor((todayUtc().getTime() - due.getTime()) / DAY) : 0, notes: i.notes,
      seller: i.seller ?? null, buyer: i.buyer ?? null, issued_at: i.issuedAt, issued_by_name: i.issuedByName,
      cancel_reason: i.cancelReason, cancelled_at: i.cancelledAt, cancelled_by_name: i.cancelledByName, created_by_name: i.createdByName, created_at: i.createdAt,
      lines: (i.lines ?? []).map((l: any) => ({ id: l.id, sequence: l.sequence, description: l.description, hsn: l.hsn, quantity: n(l.quantity), unit: l.unit, rate: n(l.rate), gst_rate: n(l.gstRate), taxable: n(l.taxable), cgst: n(l.cgst), sgst: n(l.sgst), igst: n(l.igst) })),
      payments: (i.payments ?? []).map((p: any) => ({ id: p.id, paid_on: iso(p.paidOn), amount: n(p.amount), tds: n(p.tds), method: p.method, reference: p.reference, transaction_id: p.transactionId, created_by_name: p.createdByName })),
    };
  }

  async listInvoices(q: { status?: string; clientId?: string; dateFrom?: string; dateTo?: string } = {}) {
    const where: Prisma.InvoiceWhereInput = {};
    if (q.clientId) where.clientId = Number(q.clientId) || -1;
    if (q.status && q.status !== 'OVERDUE') where.status = String(q.status).toUpperCase();
    if (q.dateFrom || q.dateTo) where.invoiceDate = { ...(q.dateFrom ? { gte: day(q.dateFrom, 'start date') } : {}), ...(q.dateTo ? { lte: day(q.dateTo, 'end date') } : {}) };
    const rows = await this.prisma.invoice.findMany({ where, orderBy: [{ invoiceDate: 'desc' }, { id: 'desc' }], include: { ...this.INV_INCLUDE, lines: false, payments: false }, take: 3000 });
    const out = rows.map((r) => this.mapInvoice(r));
    return q.status === 'OVERDUE' ? out.filter((r) => r.overdue) : out;
  }

  private async getInvoiceRow(id: number) {
    const i = await this.prisma.invoice.findUnique({ where: { id }, include: this.INV_INCLUDE });
    if (!i) throw bad('Invoice not found.', HttpStatus.NOT_FOUND);
    return i;
  }

  async getInvoice(id: number) {
    return this.mapInvoice(await this.getInvoiceRow(id));
  }

  // Which tax applies: inside the state or across states. Unknown until both sides name a state.
  private async supplyFor(client: { gstin: string | null; state: string | null }) {
    const co = await this.prisma.companyProfile.findUnique({ where: { id: 1 } });
    const from = co ? stateCodeOf(co.gstin, co.state) : null; const to = stateCodeOf(client.gstin, client.state);
    return { from, to, known: !!from && !!to, supply: (from && to && from !== to ? 'INTER' : 'INTRA') as 'INTRA' | 'INTER' };
  }

  private cleanLines(raw: any) {
    if (!Array.isArray(raw) || raw.length === 0) throw bad('Add at least one line to the invoice.');
    if (raw.length > 100) throw bad('An invoice can have at most 100 lines.');
    return raw.map((l: any, i: number) => {
      const quantity = Number(l.quantity); const rate = Number(l.rate); const gstRate = Number(l.gst_rate ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 9_999_999) throw bad(`Line ${i + 1}: the quantity must be more than zero.`);
      if (!Number.isFinite(rate) || rate < 0 || rate > MONEY_MAX) throw bad(`Line ${i + 1}: the rate must be zero or more.`);
      if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 28) throw bad(`Line ${i + 1}: the GST rate must be between 0 and 28.`);
      const hsn = cleanText(l.hsn, `Line ${i + 1} HSN or SAC`, 10);
      if (hsn && !/^\d{4,8}$/.test(hsn)) throw bad(`Line ${i + 1}: the HSN or SAC code has 4 to 8 digits.`);
      return { sequence: i + 1, description: cleanText(l.description, `Line ${i + 1} description`, 300, true)!, hsn, quantity: Math.round(quantity * 1000) / 1000, unit: cleanText(l.unit, 'Unit', 12) ?? 'nos', rate: r2(rate), gstRate: r2(gstRate) };
    });
  }

  private priced(lines: ReturnType<InvoicingService['cleanLines']>, supply: 'INTRA' | 'INTER') {
    const taxed = lines.map((l) => ({ ...l, ...taxOf({ quantity: l.quantity, rate: l.rate, gstRate: l.gstRate }, supply) }));
    return { taxed, totals: totalsOf(taxed as LineOut[]) };
  }

  private async header(b: any, current?: any) {
    const clientId = current ? current.clientId : Number(b.client_id);
    const client = Number.isInteger(clientId) ? await this.prisma.client.findUnique({ where: { id: clientId } }) : null;
    if (!client || client.isSystem || (!current && !client.isActive)) throw bad('Choose the client.');
    const invoiceDate = b.invoice_date !== undefined || !current ? day(b.invoice_date, 'invoice date') : current.invoiceDate;
    const dueDate = b.due_date ? day(b.due_date, 'due date') : b.invoice_date !== undefined || !current ? new Date(invoiceDate.getTime() + client.paymentTermsDays * DAY) : current.dueDate;
    if (dueDate.getTime() < invoiceDate.getTime()) throw bad('The due date cannot be before the invoice date.');
    const poId = b.po_id !== undefined ? (b.po_id ? Number(b.po_id) : null) : current?.poId ?? null;
    if (poId) {
      const po = await this.prisma.clientPo.findUnique({ where: { id: poId } });
      if (!po || po.clientId !== clientId) throw bad('That PO is not for this client.');
      if (po.status !== 'OPEN' && poId !== current?.poId) throw bad('That PO is not open.');
    }
    const link = await this.links(clientId, b.project_id !== undefined ? b.project_id : current?.projectId, b.build_order_id !== undefined ? b.build_order_id : current?.buildOrderId);
    return { client, invoiceDate, dueDate, poId, ...link, notes: b.notes !== undefined ? cleanText(b.notes, 'Notes', 500) : current?.notes ?? null };
  }

  async createInvoice(b: any, user: Actor) {
    const h = await this.header(b);
    const lines = this.cleanLines(b.lines);
    const sup = await this.supplyFor(h.client);
    const { taxed, totals } = this.priced(lines, sup.supply);
    const inv = await this.prisma.invoice.create({
      data: {
        clientId: h.client.id, poId: h.poId, projectId: h.projectId, buildOrderId: h.buildOrderId, invoiceDate: h.invoiceDate, dueDate: h.dueDate, notes: h.notes,
        taxable: totals.taxable, cgst: totals.cgst, sgst: totals.sgst, igst: totals.igst, roundOff: totals.round_off, total: totals.total, status: 'DRAFT',
        createdBy: user.id, createdByName: user.username ?? null,
        lines: { create: taxed.map((l) => ({ sequence: l.sequence, description: l.description, hsn: l.hsn, quantity: l.quantity, unit: l.unit, rate: l.rate, gstRate: l.gstRate, taxable: l.taxable, cgst: l.cgst, sgst: l.sgst, igst: l.igst })) },
      },
    });
    const out = await this.getInvoice(inv.id);
    this.log('invoices', inv.id, 'INSERT', user.id, 'Draft', null, out);
    return out;
  }

  async updateInvoice(id: number, b: any, user: Actor) {
    const cur = await this.getInvoiceRow(id);
    if (cur.status !== 'DRAFT') throw bad('Only a draft invoice can be edited. An issued invoice is cancelled, not changed.', HttpStatus.CONFLICT);
    const h = await this.header(b, cur);
    const lines = b.lines !== undefined ? this.cleanLines(b.lines) : cur.lines.map((l: any) => ({ sequence: l.sequence, description: l.description, hsn: l.hsn, quantity: n(l.quantity), unit: l.unit, rate: n(l.rate), gstRate: n(l.gstRate) }));
    const sup = await this.supplyFor(h.client);
    const { taxed, totals } = this.priced(lines as any, sup.supply);
    const before = this.mapInvoice(cur);
    await this.prisma.$transaction(async (tx) => {
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.update({
        where: { id },
        data: {
          poId: h.poId, projectId: h.projectId, buildOrderId: h.buildOrderId, invoiceDate: h.invoiceDate, dueDate: h.dueDate, notes: h.notes,
          taxable: totals.taxable, cgst: totals.cgst, sgst: totals.sgst, igst: totals.igst, roundOff: totals.round_off, total: totals.total,
          lines: { create: taxed.map((l) => ({ sequence: l.sequence, description: l.description, hsn: l.hsn, quantity: l.quantity, unit: l.unit, rate: l.rate, gstRate: l.gstRate, taxable: l.taxable, cgst: l.cgst, sgst: l.sgst, igst: l.igst })) },
        },
      });
    });
    const out = await this.getInvoice(id);
    this.log('invoices', id, 'UPDATE', user.id, 'Draft', before, out);
    return out;
  }

  async deleteInvoice(id: number, user: Actor) {
    const cur = await this.getInvoiceRow(id);
    if (cur.status !== 'DRAFT') throw bad('Only a draft invoice can be deleted. Cancel an issued invoice instead.', HttpStatus.CONFLICT);
    const before = this.mapInvoice(cur);
    await this.prisma.invoice.delete({ where: { id } });
    this.log('invoices', id, 'DELETE', user.id, 'Draft', before, null);
    return { deleted: true };
  }

  // Issuing gives the invoice its number and freezes it: who it is from, who it is to, and the tax that applies
  async issueInvoice(id: number, user: Actor) {
    const cur = await this.getInvoiceRow(id);
    if (cur.status !== 'DRAFT') throw bad('Only a draft invoice can be issued.', HttpStatus.CONFLICT);
    const co = await this.prisma.companyProfile.findUnique({ where: { id: 1 } });
    if (!co || !co.legalName || !co.gstin || !co.state) throw bad('Fill in the company details (legal name, GSTIN and state) before issuing an invoice. They are on the Organization page.');
    const client = await this.prisma.client.findUnique({ where: { id: cur.clientId } });
    if (!client) throw bad('Client not found.', HttpStatus.NOT_FOUND);
    const sup = await this.supplyFor(client);
    if (!sup.known) throw bad(`Set the state or GSTIN of ${client.name} on the Clients page, so the tax can be worked out.`);
    if (cur.invoiceDate.getTime() > todayUtc().getTime()) throw bad('An invoice cannot be issued with a date in the future.');
    await this.assertMonthOpen(cur.invoiceDate, 'an invoice cannot be issued for it');
    const lines = this.cleanLines(cur.lines.map((l: any) => ({ description: l.description, hsn: l.hsn, quantity: n(l.quantity), unit: l.unit, rate: n(l.rate), gst_rate: n(l.gstRate) })));
    const { taxed, totals } = this.priced(lines, sup.supply);
    if (totals.total <= 0) throw bad('The invoice total must be more than zero.');
    const seller = { legal_name: co.legalName, gstin: co.gstin, pan: co.pan, address_line: co.addressLine, city: co.city, state: co.state, state_code: sup.from, postal_code: co.postalCode, email: co.email, phone: co.phone, bank_name: co.bankName, bank_account: co.bankAccount, bank_ifsc: co.bankIfsc, terms: co.terms, signatory: co.signatory };
    const buyer = { name: client.name, code: client.code, gstin: client.gstin, address_line: [client.street, client.addressLine2].filter(Boolean).join(', ') || client.address, city: client.city, state: client.state ?? GST_STATES[sup.to!], state_code: sup.to, postal_code: client.postalCode };
    const before = this.mapInvoice(cur);

    await this.prisma.$transaction(async (tx) => {
      // The counter row is locked by this update until the transaction ends, so two invoices can never take the same number
      const next = await tx.$queryRaw<{ last_seq: number }[]>`UPDATE invoice_counter SET last_seq = last_seq + 1 WHERE id = 1 RETURNING last_seq`;
      const seq = next[0]?.last_seq;
      if (!seq) throw bad('The invoice counter is missing.', HttpStatus.INTERNAL_SERVER_ERROR);
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.update({
        where: { id },
        data: {
          number: invoiceNumber(cur.invoiceDate, seq), status: 'ISSUED', supplyType: sup.supply, placeOfSupply: buyer.state, seller, buyer, issuedAt: new Date(), issuedByName: user.username ?? null,
          taxable: totals.taxable, cgst: totals.cgst, sgst: totals.sgst, igst: totals.igst, roundOff: totals.round_off, total: totals.total,
          lines: { create: taxed.map((l) => ({ sequence: l.sequence, description: l.description, hsn: l.hsn, quantity: l.quantity, unit: l.unit, rate: l.rate, gstRate: l.gstRate, taxable: l.taxable, cgst: l.cgst, sgst: l.sgst, igst: l.igst })) },
        },
      });
      await this.settlePo(tx, cur.poId);
    });
    const out = await this.getInvoice(id);
    this.log('invoices', id, 'UPDATE', user.id, out.number, before, out);
    return out;
  }

  async cancelInvoice(id: number, reason: string, user: Actor) {
    const cur = await this.getInvoiceRow(id);
    const why = String(reason ?? '').trim();
    if (why.length < 3) throw bad('Give a reason for cancelling the invoice.');
    if (why.length > 300) throw bad('The reason can be at most 300 characters.');
    if (cur.status === 'CANCELLED') throw bad('This invoice is already cancelled.', HttpStatus.CONFLICT);
    if (cur.status === 'DRAFT') throw bad('A draft is deleted, not cancelled.', HttpStatus.CONFLICT);
    if (cur.payments.length) throw bad('Payments are recorded against this invoice. Remove them first.', HttpStatus.CONFLICT);
    await this.assertMonthOpen(cur.invoiceDate, 'its invoices cannot be cancelled');
    const before = this.mapInvoice(cur);
    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: why, cancelledAt: new Date(), cancelledByName: user.username ?? null } });
      await this.settlePo(tx, cur.poId);
    });
    const out = await this.getInvoice(id);
    this.log('invoices', id, 'UPDATE', user.id, out.number, before, out);
    return out;
  }

  // ── Payments ───────────────────────────────────────────────────────────────

  private async incomeCategory(tx: Prisma.TransactionClient) {
    const found = await tx.category.findFirst({ where: { type: 'income', name: 'Client invoice payments' } });
    return found ?? tx.category.create({ data: { name: 'Client invoice payments', type: 'income', isCustom: false } });
  }

  private status(total: number, paid: number, tds: number) {
    const settled = r2(paid + tds);
    return settled <= 0 ? 'ISSUED' : settled >= total - 0.005 ? 'PAID' : 'PART_PAID';
  }

  async addPayment(id: number, b: any, user: Actor) {
    const cur = await this.getInvoiceRow(id);
    if (!['ISSUED', 'PART_PAID'].includes(cur.status)) throw bad(cur.status === 'PAID' ? 'This invoice is already paid in full.' : 'Payments can only be recorded against an issued invoice.', HttpStatus.CONFLICT);
    const paidOn = day(b.paid_on, 'payment date');
    if (paidOn.getTime() < cur.invoiceDate.getTime()) throw bad('The payment date cannot be before the invoice date.');
    if (paidOn.getTime() > todayUtc().getTime()) throw bad('The payment date cannot be in the future.');
    const amount = money(b.amount ?? 0, 'The amount received'); const tds = money(b.tds ?? 0, 'The TDS');
    if (amount + tds <= 0) throw bad('Enter the amount received or the TDS deducted.');
    const balance = r2(n(cur.total) - n(cur.paid) - n(cur.tds));
    if (r2(amount + tds) > balance + 0.005) throw bad(`The payment is more than the balance of ${balance.toFixed(2)}.`);
    await this.assertMonthOpen(paidOn, 'a payment cannot be recorded in it');
    const method = (cleanText(b.method, 'Method', 20) ?? 'bank').toLowerCase();
    const reference = cleanText(b.reference, 'Reference', 100);
    const before = this.mapInvoice(cur);

    await this.prisma.$transaction(async (tx) => {
      let transactionId: number | null = null;
      if (amount > 0) {
        const cat = await this.incomeCategory(tx);
        const now = new Date();
        const t = await tx.transaction.create({
          data: {
            userId: user.id, type: 'income', amount, netAmount: amount, totalAmount: amount, dateRecorded: paidOn, categoryId: cat.id,
            description: `Payment for ${cur.number} from ${cur.client?.name ?? 'client'}${reference ? ` (${reference})` : ''}`.slice(0, 500), paymentMethod: method, clientId: cur.clientId,
            projectId: cur.projectId, contextType: 'project', status: 'APPROVED', currency: 'INR',
            submittedAt: now, submittedById: user.id, submittedByName: user.username ?? null,
            approvedAt: now, approvedById: user.id, approvedByName: user.username ?? null, approvedByRole: user.role_name ?? null,
          },
        });
        await tx.transaction.update({ where: { id: t.id }, data: { referenceId: `INC-${10000 + t.id}` } });
        transactionId = t.id;
      }
      await tx.invoicePayment.create({ data: { invoiceId: id, paidOn, amount, tds, method, reference, transactionId, createdByName: user.username ?? null } });
      const sums = await tx.invoicePayment.aggregate({ where: { invoiceId: id }, _sum: { amount: true, tds: true } });
      const paid = r2(n(sums._sum.amount)); const tdsSum = r2(n(sums._sum.tds));
      await tx.invoice.update({ where: { id }, data: { paid, tds: tdsSum, status: this.status(n(cur.total), paid, tdsSum) } });
    });
    const out = await this.getInvoice(id);
    this.log('invoice_payments', id, 'INSERT', user.id, out.number, before, out);
    return out;
  }

  async removePayment(id: number, paymentId: number, user: Actor) {
    const cur = await this.getInvoiceRow(id);
    const pay = cur.payments.find((p) => p.id === paymentId);
    if (!pay) throw bad('Payment not found.', HttpStatus.NOT_FOUND);
    await this.assertMonthOpen(pay.paidOn, 'its payments cannot be removed');
    const before = this.mapInvoice(cur);
    await this.prisma.$transaction(async (tx) => {
      // The income entry the payment made is voided, not erased, so the history stays
      if (pay.transactionId) {
        await tx.transaction.update({ where: { id: pay.transactionId }, data: { status: 'VOIDED', voidedAt: new Date(), voidedById: user.id, voidedByName: user.username ?? null, voidReason: `Payment removed from ${cur.number}` } });
      }
      await tx.invoicePayment.delete({ where: { id: paymentId } });
      const sums = await tx.invoicePayment.aggregate({ where: { invoiceId: id }, _sum: { amount: true, tds: true } });
      const paid = r2(n(sums._sum.amount)); const tdsSum = r2(n(sums._sum.tds));
      await tx.invoice.update({ where: { id }, data: { paid, tds: tdsSum, status: this.status(n(cur.total), paid, tdsSum) } });
    });
    const out = await this.getInvoice(id);
    this.log('invoice_payments', id, 'DELETE', user.id, out.number, before, out);
    return out;
  }

  // ── What clients owe ───────────────────────────────────────────────────────

  async summary() {
    const [invoices, pos, clients] = await Promise.all([
      this.prisma.invoice.findMany({ where: { status: { in: ISSUED } }, select: { clientId: true, total: true, paid: true, tds: true, status: true, dueDate: true } }),
      this.prisma.clientPo.findMany({ where: { status: 'OPEN' }, select: { clientId: true } }),
      this.prisma.client.findMany({ select: { id: true } }),
    ]);
    const today = todayUtc().getTime();
    const by = new Map<number, { billed: number; received: number; outstanding: number; overdue: number; overdue_count: number; open_pos: number }>();
    for (const c of clients) by.set(c.id, { billed: 0, received: 0, outstanding: 0, overdue: 0, overdue_count: 0, open_pos: 0 });
    for (const i of invoices) {
      const e = by.get(i.clientId)!;
      const bal = r2(n(i.total) - n(i.paid) - n(i.tds));
      e.billed += n(i.total); e.received += n(i.paid) + n(i.tds); e.outstanding += bal;
      if (bal > 0.005 && i.dueDate.getTime() < today) { e.overdue += bal; e.overdue_count += 1; }
    }
    for (const p of pos) by.get(p.clientId)!.open_pos += 1;
    const rows = [...by.entries()].map(([client_id, e]) => ({ client_id, billed: r2(e.billed), received: r2(e.received), outstanding: r2(e.outstanding), overdue: r2(e.overdue), overdue_count: e.overdue_count, open_pos: e.open_pos }));
    const sum = (k: 'billed' | 'received' | 'outstanding' | 'overdue') => r2(rows.reduce((a, r) => a + r[k], 0));
    return { rows, totals: { billed: sum('billed'), received: sum('received'), outstanding: sum('outstanding'), overdue: sum('overdue'), overdue_count: rows.reduce((a, r) => a + r.overdue_count, 0) } };
  }

  // ── Project and order billing ──────────────────────────────────────────────

  // What has been ordered, invoiced and received for one project or one order. An invoice counts when it names the project or order itself or sits on a PO that does.
  async billing(q: { projectId?: string; buildOrderId?: string } = {}) {
    const projectId = q.projectId ? Number(q.projectId) : null; const buildOrderId = q.buildOrderId ? Number(q.buildOrderId) : null;
    if (!!projectId === !!buildOrderId || (projectId ?? buildOrderId)! < 1 || Number.isNaN(projectId ?? buildOrderId)) throw bad('Give either a project or an order.');
    const poWhere: Prisma.ClientPoWhereInput = projectId ? { projectId } : { buildOrderId };
    const invWhere: Prisma.InvoiceWhereInput = { status: { not: 'CANCELLED' }, OR: [projectId ? { projectId } : { buildOrderId: buildOrderId! }, { po: poWhere }] };
    const [pos, invoices, target] = await Promise.all([
      this.prisma.clientPo.findMany({ where: { ...poWhere, status: { not: 'CANCELLED' } }, orderBy: [{ poDate: 'desc' }, { id: 'desc' }] }),
      this.prisma.invoice.findMany({ where: invWhere, orderBy: [{ invoiceDate: 'desc' }, { id: 'desc' }], take: 200 }),
      projectId
        ? this.prisma.project.findUnique({ where: { id: projectId }, select: { contractValue: true } })
        : this.prisma.buildOrder.findUnique({ where: { id: buildOrderId! }, select: { unitPrice: true, quantity: true } }),
    ]);
    if (!target) throw bad(projectId ? 'Project not found.' : 'Order not found.', HttpStatus.NOT_FOUND);
    const contract = projectId
      ? ((target as any).contractValue == null ? null : n((target as any).contractValue))
      : ((target as any).unitPrice == null ? null : r2(n((target as any).unitPrice) * n((target as any).quantity)));
    const today = todayUtc().getTime();
    const issued = invoices.filter((i) => ISSUED.includes(i.status));
    const byPo = new Map<number, number>();
    for (const i of issued) if (i.poId) byPo.set(i.poId, (byPo.get(i.poId) ?? 0) + n(i.taxable));
    const rows = invoices.map((i) => {
      const bal = i.status === 'DRAFT' ? 0 : r2(n(i.total) - n(i.paid) - n(i.tds));
      return { id: i.id, number: i.number, status: i.status, invoice_date: iso(i.invoiceDate), taxable: n(i.taxable), total: n(i.total), balance: bal, overdue: ['ISSUED', 'PART_PAID'].includes(i.status) && bal > 0.005 && i.dueDate.getTime() < today };
    });
    const invoiced = r2(issued.reduce((a, i) => a + n(i.taxable), 0));
    const poValue = r2(pos.reduce((a, p) => a + n(p.value), 0));
    return {
      contract_value: contract, po_value: poValue, invoiced, to_invoice: contract != null ? r2(contract - invoiced) : null,
      invoiced_pct: contract && contract > 0 ? r2((invoiced / contract) * 100) : poValue > 0 ? r2((invoiced / poValue) * 100) : null,
      received: r2(issued.reduce((a, i) => a + n(i.paid) + n(i.tds), 0)), outstanding: r2(rows.reduce((a, r) => a + r.balance, 0)), overdue: r2(rows.filter((r) => r.overdue).reduce((a, r) => a + r.balance, 0)),
      drafts: rows.filter((r) => r.status === 'DRAFT').length,
      pos: pos.map((p) => ({ id: p.id, po_number: p.poNumber, value: n(p.value), invoiced: r2(byPo.get(p.id) ?? 0), status: p.status })),
      invoices: rows,
    };
  }

  // ── Home and reports ───────────────────────────────────────────────────────

  // What Home shows: what is owed, what is late, who owes most, and what is waiting to be issued
  async homeBlock() {
    const today = todayUtc(); const soon = new Date(today.getTime() + 14 * DAY); const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const [open, drafts, expiring, received] = await Promise.all([
      this.prisma.invoice.findMany({ where: { status: { in: ['ISSUED', 'PART_PAID'] } }, select: { clientId: true, total: true, paid: true, tds: true, dueDate: true, client: { select: { name: true } } } }),
      this.prisma.invoice.count({ where: { status: 'DRAFT' } }),
      this.prisma.clientPo.count({ where: { status: 'OPEN', validUntil: { not: null, lte: soon } } }),
      this.prisma.invoicePayment.aggregate({ where: { paidOn: { gte: monthStart } }, _sum: { amount: true } }),
    ]);
    let outstanding = 0; let overdue = 0; let overdueCount = 0; let oldest = 0;
    const owed = new Map<number, { name: string; outstanding: number; overdue: number }>();
    for (const i of open) {
      const bal = r2(n(i.total) - n(i.paid) - n(i.tds));
      if (bal <= 0.005) continue;
      const late = Math.floor((today.getTime() - i.dueDate.getTime()) / DAY);
      outstanding += bal;
      const e = owed.get(i.clientId) ?? { name: i.client?.name ?? '', outstanding: 0, overdue: 0 };
      e.outstanding += bal;
      if (late > 0) { overdue += bal; overdueCount += 1; e.overdue += bal; oldest = Math.max(oldest, late); }
      owed.set(i.clientId, e);
    }
    const top = [...owed.entries()].map(([client_id, e]) => ({ client_id, name: e.name, outstanding: r2(e.outstanding), overdue: r2(e.overdue) })).sort((a, b) => b.outstanding - a.outstanding).slice(0, 4);
    return { outstanding: r2(outstanding), overdue: r2(overdue), overdue_count: overdueCount, oldest_overdue_days: oldest, drafts, expiring_pos: expiring, received_this_month: r2(n(received._sum.amount)), clients_owing: owed.size, top };
  }

  // Money owed by each client, by how long it has been due, as of today or as of an earlier date.
  // As of an earlier date it counts the invoices issued by then and the payments made by then.
  async ageingReport(asOf?: Date) {
    const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const today = todayUtc().getTime();
    const at = asOf ? Math.min(day(asOf), today) : today;
    const past = at < today;
    type Open = { clientId: number; bal: number; dueDate: Date; clientName: string };
    const open: Open[] = [];
    if (!past) {
      const invoices = await this.prisma.invoice.findMany({ where: { status: { in: ['ISSUED', 'PART_PAID'] } }, select: { clientId: true, total: true, paid: true, tds: true, dueDate: true, client: { select: { name: true } } } });
      for (const i of invoices) open.push({ clientId: i.clientId, bal: r2(n(i.total) - n(i.paid) - n(i.tds)), dueDate: i.dueDate, clientName: i.client?.name ?? '' });
    } else {
      const cutoff = new Date(at);
      const invoices = await this.prisma.invoice.findMany({
        where: { status: { not: 'DRAFT' }, invoiceDate: { lte: cutoff }, OR: [{ status: { not: 'CANCELLED' } }, { cancelledAt: { gt: new Date(at + DAY) } }] },
        select: { clientId: true, total: true, dueDate: true, client: { select: { name: true } }, payments: { where: { paidOn: { lte: cutoff } }, select: { amount: true, tds: true } } },
      });
      for (const i of invoices) open.push({ clientId: i.clientId, bal: r2(n(i.total) - i.payments.reduce((a, p) => a + n(p.amount) + n(p.tds), 0)), dueDate: i.dueDate, clientName: i.client?.name ?? '' });
    }
    type Row = { Client: string; Invoices: number; 'Not Due': number; '1-30 Days': number; '31-60 Days': number; '61-90 Days': number; 'Over 90 Days': number; Outstanding: number; _clientId?: number };
    const by = new Map<number, Row>();
    for (const i of open) {
      if (i.bal <= 0.005) continue;
      const late = Math.floor((at - i.dueDate.getTime()) / DAY);
      const col = late <= 0 ? 'Not Due' : late <= 30 ? '1-30 Days' : late <= 60 ? '31-60 Days' : late <= 90 ? '61-90 Days' : 'Over 90 Days';
      const r = by.get(i.clientId) ?? { Client: i.clientName, Invoices: 0, 'Not Due': 0, '1-30 Days': 0, '31-60 Days': 0, '61-90 Days': 0, 'Over 90 Days': 0, Outstanding: 0, _clientId: i.clientId };
      r.Invoices += 1; r[col] = r2(r[col] + i.bal); r.Outstanding = r2(r.Outstanding + i.bal);
      by.set(i.clientId, r);
    }
    const rows = [...by.values()].sort((a, b) => b.Outstanding - a.Outstanding);
    const sum = (k: keyof Row) => r2(rows.reduce((a, r) => a + (r[k] as number), 0));
    return {
      title: 'Receivables Ageing',
      columns: ['Client', 'Invoices', 'Not Due', '1-30 Days', '31-60 Days', '61-90 Days', 'Over 90 Days', 'Outstanding'],
      rows,
      totals: { Invoices: sum('Invoices'), 'Not Due': sum('Not Due'), '1-30 Days': sum('1-30 Days'), '31-60 Days': sum('31-60 Days'), '61-90 Days': sum('61-90 Days'), 'Over 90 Days': sum('Over 90 Days'), Outstanding: sum('Outstanding') },
      note: `Counted from the due date, as of ${past ? new Date(at).toISOString().slice(0, 10) : 'today'}. The tax a client deducts (TDS) counts as received.${past ? ' Invoices issued and payments made after that date are left out.' : ''}`,
    };
  }

  // Every invoice issued in the period, with the tax split, for the GST return
  async salesRegister(dateFrom?: Date, dateTo?: Date) {
    const invoices = await this.prisma.invoice.findMany({
      where: { status: { in: [...ISSUED, 'CANCELLED'] }, number: { not: null }, ...(dateFrom || dateTo ? { invoiceDate: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {}) },
      orderBy: [{ invoiceDate: 'asc' }, { number: 'asc' }], include: { client: { select: { name: true } } },
    });
    const live = invoices.filter((i) => i.status !== 'CANCELLED');
    const rows = invoices.map((i) => {
      const gone = i.status === 'CANCELLED';
      const buyer = (i.buyer ?? {}) as { gstin?: string | null };
      const z = (v: unknown) => (gone ? 0 : n(v));
      return {
        'Invoice No': i.number, Date: iso(i.invoiceDate), Client: i.client?.name ?? '', GSTIN: buyer.gstin || 'Unregistered', 'Place Of Supply': i.placeOfSupply ?? '',
        Taxable: z(i.taxable), CGST: z(i.cgst), SGST: z(i.sgst), IGST: z(i.igst), 'Round Off': z(i.roundOff), 'Invoice Value': z(i.total), Status: gone ? 'Cancelled' : 'Issued',
      };
    });
    const sum = (k: 'taxable' | 'cgst' | 'sgst' | 'igst' | 'roundOff' | 'total') => r2(live.reduce((a, i) => a + n(i[k]), 0));
    return {
      title: 'GST Sales Register',
      columns: ['Invoice No', 'Date', 'Client', 'GSTIN', 'Place Of Supply', 'Taxable', 'CGST', 'SGST', 'IGST', 'Round Off', 'Invoice Value', 'Status'],
      rows,
      totals: { Taxable: sum('taxable'), CGST: sum('cgst'), SGST: sum('sgst'), IGST: sum('igst'), 'Round Off': sum('roundOff'), 'Invoice Value': sum('total') },
      note: 'By invoice date. Cancelled invoices stay listed with no value so the number series has no gaps.',
    };
  }
  private static readonly METHOD_LABEL: Record<string, string> = { BANK: 'Bank', UPI: 'UPI', CASH: 'Cash', CHEQUE: 'Cheque' };
  private static pay(m: string | null) { return m ? (InvoicingService.METHOD_LABEL[m.toUpperCase()] ?? m) : ''; }
  private static readonly STATUS_LABEL: Record<string, string> = { ISSUED: 'Issued', PART_PAID: 'Part Paid', PAID: 'Paid', CANCELLED: 'Cancelled' };

  private periodWhere(field: string, dateFrom?: Date, dateTo?: Date) {
    return dateFrom || dateTo ? { [field]: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {};
  }

  // Every invoice raised in the period with what has been received and what is still due
  async invoiceRegister(dateFrom?: Date, dateTo?: Date, clientId?: number) {
    const today = todayUtc().getTime();
    const invoices = await this.prisma.invoice.findMany({
      where: { status: { in: [...ISSUED, 'CANCELLED'] }, number: { not: null }, ...(clientId ? { clientId } : {}), ...this.periodWhere('invoiceDate', dateFrom, dateTo) },
      orderBy: [{ invoiceDate: 'asc' }, { number: 'asc' }],
      include: { client: { select: { name: true } }, po: { select: { poNumber: true } }, project: { select: { name: true } }, buildOrder: { select: { code: true } } },
    });
    const rows = invoices.map((i) => {
      const gone = i.status === 'CANCELLED';
      const balance = gone ? 0 : r2(n(i.total) - n(i.paid) - n(i.tds));
      const late = !gone && balance > 0.005 ? Math.floor((today - i.dueDate.getTime()) / DAY) : 0;
      return {
        'Invoice No': i.number, Date: iso(i.invoiceDate), 'Due Date': iso(i.dueDate), Client: i.client?.name ?? '', 'Client PO': i.po?.poNumber ?? '',
        Against: i.project?.name ?? i.buildOrder?.code ?? '', 'Invoice Value': gone ? 0 : n(i.total), Received: gone ? 0 : n(i.paid), TDS: gone ? 0 : n(i.tds), Balance: balance,
        'Days Overdue': late > 0 ? late : null, Status: InvoicingService.STATUS_LABEL[i.status] ?? i.status, _clientId: i.clientId,
      };
    });
    const sum = (k: 'Invoice Value' | 'Received' | 'TDS' | 'Balance') => r2(rows.reduce((a, r) => a + r[k], 0));
    return {
      title: 'Invoice Register',
      columns: ['Invoice No', 'Date', 'Due Date', 'Client', 'Client PO', 'Against', 'Invoice Value', 'Received', 'TDS', 'Balance', 'Days Overdue', 'Status'],
      rows,
      totals: { 'Invoice Value': sum('Invoice Value'), Received: sum('Received'), TDS: sum('TDS'), Balance: sum('Balance') },
      note: 'By invoice date. Balance is the invoice value less money received and tax deducted at source. Days Overdue counts from the due date to today for invoices with a balance. Cancelled invoices stay listed with no value.',
    };
  }

  // One client's account for the period: invoices raised, money received, and the balance after each line
  async clientStatement(clientId: number | undefined, dateFrom?: Date, dateTo?: Date) {
    if (!clientId) throw bad('Choose a client for the statement.');
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
    if (!client) throw bad('That client was not found.', HttpStatus.NOT_FOUND);
    const invoices = await this.prisma.invoice.findMany({
      where: { clientId, status: { in: ISSUED } }, orderBy: [{ invoiceDate: 'asc' }, { number: 'asc' }],
      select: { id: true, number: true, invoiceDate: true, total: true, payments: { select: { paidOn: true, amount: true, tds: true, method: true, reference: true }, orderBy: { paidOn: 'asc' } } },
    });
    type Line = { date: Date; order: number; type: string; ref: string; detail: string; debit: number; credit: number };
    const all: Line[] = [];
    for (const i of invoices) {
      all.push({ date: i.invoiceDate, order: 0, type: 'Invoice', ref: i.number ?? '', detail: '', debit: n(i.total), credit: 0 });
      for (const p of i.payments) {
        const how = [InvoicingService.pay(p.method), p.reference].filter(Boolean).join(' ');
        all.push({ date: p.paidOn, order: 1, type: 'Payment', ref: i.number ?? '', detail: [how, n(p.tds) > 0 ? `TDS ${n(p.tds).toFixed(2)}` : ''].filter(Boolean).join(', '), debit: 0, credit: r2(n(p.amount) + n(p.tds)) });
      }
    }
    all.sort((a, b) => a.date.getTime() - b.date.getTime() || a.order - b.order);
    let balance = r2(all.filter((l) => dateFrom && l.date < dateFrom).reduce((a, l) => a + l.debit - l.credit, 0));
    const inPeriod = all.filter((l) => (!dateFrom || l.date >= dateFrom) && (!dateTo || l.date <= dateTo));
    const rows: Record<string, unknown>[] = [{ Date: dateFrom ? iso(dateFrom) : '', Type: 'Opening', Reference: '', Details: 'Balance brought forward', Debit: null, Credit: null, Balance: balance }];
    for (const l of inPeriod) {
      balance = r2(balance + l.debit - l.credit);
      rows.push({ Date: iso(l.date), Type: l.type, Reference: l.ref, Details: l.detail, Debit: l.debit || null, Credit: l.credit || null, Balance: balance });
    }
    const sum = (k: 'debit' | 'credit') => r2(inPeriod.reduce((a, l) => a + l[k], 0));
    return {
      title: `Client Statement: ${client.name}`,
      columns: ['Date', 'Type', 'Reference', 'Details', 'Debit', 'Credit', 'Balance'],
      rows,
      totals: { Debit: sum('debit'), Credit: sum('credit'), Balance: balance },
      note: 'Debit is the invoice value and credit is money received plus tax deducted at source. Balance is what the client owes after each line, and the total row shows the closing balance. Cancelled invoices are left out.',
    };
  }

  // Money received in the period, one line per payment
  async collections(dateFrom?: Date, dateTo?: Date, clientId?: number) {
    const payments = await this.prisma.invoicePayment.findMany({
      where: { invoice: { status: { in: [...ISSUED] }, ...(clientId ? { clientId } : {}) }, ...this.periodWhere('paidOn', dateFrom, dateTo) },
      orderBy: [{ paidOn: 'asc' }, { id: 'asc' }],
      include: { invoice: { select: { number: true, clientId: true, client: { select: { name: true } } } } },
    });
    const rows = payments.map((p) => ({
      Date: iso(p.paidOn), Client: p.invoice.client?.name ?? '', 'Invoice No': p.invoice.number ?? '', Method: InvoicingService.pay(p.method), Reference: p.reference ?? '',
      Received: n(p.amount), TDS: n(p.tds), 'Total Credited': r2(n(p.amount) + n(p.tds)), 'Recorded By': p.createdByName ?? '', _clientId: p.invoice.clientId,
    }));
    const sum = (k: 'Received' | 'TDS' | 'Total Credited') => r2(rows.reduce((a, r) => a + r[k], 0));
    return {
      title: 'Collections',
      columns: ['Date', 'Client', 'Invoice No', 'Method', 'Reference', 'Received', 'TDS', 'Total Credited', 'Recorded By'],
      rows,
      totals: { Received: sum('Received'), TDS: sum('TDS'), 'Total Credited': sum('Total Credited') },
      note: 'By the date the money was received. Received is what reached the bank; Total Credited adds the tax the client deducted at source, which is what clears the invoice.',
    };
  }

  // Tax the clients deducted before paying us, to match against the TDS certificates
  async tdsRegister(dateFrom?: Date, dateTo?: Date, clientId?: number) {
    const payments = await this.prisma.invoicePayment.findMany({
      where: { tds: { gt: 0 }, invoice: { status: { in: [...ISSUED] }, ...(clientId ? { clientId } : {}) }, ...this.periodWhere('paidOn', dateFrom, dateTo) },
      orderBy: [{ paidOn: 'asc' }, { id: 'asc' }],
      include: { invoice: { select: { number: true, clientId: true, buyer: true, client: { select: { name: true } } } } },
    });
    const rows = payments.map((p) => {
      const buyer = (p.invoice.buyer ?? {}) as { gstin?: string | null };
      const pan = buyer.gstin && buyer.gstin.length >= 12 ? buyer.gstin.slice(2, 12) : '';
      return { Date: iso(p.paidOn), Client: p.invoice.client?.name ?? '', PAN: pan, 'Invoice No': p.invoice.number ?? '', 'TDS Deducted': n(p.tds), Received: n(p.amount), _clientId: p.invoice.clientId };
    });
    const sum = (k: 'TDS Deducted' | 'Received') => r2(rows.reduce((a, r) => a + r[k], 0));
    return {
      title: 'TDS Register',
      columns: ['Date', 'Client', 'PAN', 'Invoice No', 'TDS Deducted', 'Received'],
      rows,
      totals: { 'TDS Deducted': sum('TDS Deducted'), Received: sum('Received') },
      note: 'Payments where the client held back tax at source, by the date received, to match against their TDS certificates. PAN is taken from the client GSTIN on the invoice, so it is blank for an unregistered client.',
    };
  }

  // Each client PO: what it is worth, what has been billed against it and how much is left
  async clientPoStatus(clientId?: number) {
    const today = todayUtc().getTime();
    const pos = await this.prisma.clientPo.findMany({
      where: clientId ? { clientId } : {}, orderBy: [{ poDate: 'desc' }, { id: 'desc' }],
      include: { client: { select: { name: true } }, project: { select: { name: true } }, buildOrder: { select: { code: true } }, invoices: { where: { status: { in: [...ISSUED] } }, select: { taxable: true } } },
    });
    const rows = pos.map((p) => {
      const value = n(p.value);
      const billed = r2(p.invoices.reduce((a, i) => a + n(i.taxable), 0));
      const expired = p.status === 'OPEN' && p.validUntil != null && p.validUntil.getTime() < today;
      return {
        'PO No': p.poNumber, Client: p.client?.name ?? '', 'PO Date': iso(p.poDate), 'Valid Until': iso(p.validUntil), Against: p.project?.name ?? p.buildOrder?.code ?? '',
        'PO Value': value, Invoiced: billed, Remaining: r2(value - billed), '% Billed': value > 0 ? r2((billed / value) * 100) : null,
        Status: expired ? 'Expired' : p.status === 'OPEN' ? 'Open' : p.status === 'CLOSED' ? (p.autoClosed ? 'Closed, fully billed' : 'Closed') : 'Cancelled', _clientId: p.clientId,
      };
    });
    const live = rows.filter((r) => r.Status !== 'Cancelled');
    const sum = (k: 'PO Value' | 'Invoiced' | 'Remaining') => r2(live.reduce((a, r) => a + r[k], 0));
    return {
      title: 'Client PO Status',
      columns: ['PO No', 'Client', 'PO Date', 'Valid Until', 'Against', 'PO Value', 'Invoiced', 'Remaining', '% Billed', 'Status'],
      rows,
      totals: { 'PO Value': sum('PO Value'), Invoiced: sum('Invoiced'), Remaining: sum('Remaining') },
      note: 'Invoiced is the taxable value of issued invoices raised against the PO, compared with the PO value. Cancelled POs are listed but not added up. Open POs past their valid-until date show as Expired.',
    };
  }
}
