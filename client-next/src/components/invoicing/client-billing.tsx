'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Ban, CircleCheck, CreditCard, FileText, FolderOpen, Paperclip, Pencil, Plus, Send, Trash2, Undo2 } from 'lucide-react';
import { ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import api, { API_BASE, getAccessToken } from '@/lib/api-client';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatDate } from '@/lib/currency';
import { money } from '@/lib/money';
import { canPropose, isFinanceRole } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth-store';
import { useInvalidate } from '@/hooks/use-queries';
import { INVOICE_STATUS, PO_STATUS, useClientPo, useClientPos, useInvoice, useInvoiceSummary, useInvoices, type ClientPo, type Invoice, type InvoiceStatus } from '@/hooks/use-invoicing';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { type FilterDef } from '@/components/data-table/filters';
import { DateCell, IdCell, TextCell, ToneText, WholeCell, headerRight } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { ConfirmDialog } from '@/components/shared/modal-primitives';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { RecordLink } from '@/components/budgets/budget-ui';
import { CancelInvoiceModal, InvoiceModal, PaymentModal, PoModal } from '@/components/invoicing/invoicing-modals';

const TONE_CLASS = { success: 'text-[var(--success)]', warning: 'text-[var(--warning)]', danger: 'text-[var(--danger)]', info: 'text-[var(--info)]', muted: 'text-[var(--shell-text-muted)]' } as const;

// The client's PO file is behind the sign-in, so it is fetched with the token and opened from memory
async function openFile(name: string) {
  try {
    const token = getAccessToken();
    const res = await fetch(`${API_BASE}/receipts/${name}`, { credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error();
    window.open(URL.createObjectURL(await res.blob()), '_blank');
  } catch { toast.error('The file could not be opened.'); }
}

function useRoles() {
  const role = useAuthStore((s) => s.user?.role_name);
  return { canWrite: canPropose(role), canMoney: isFinanceRole(role) };
}

// ── Purchase orders tab ────────────────────────────────────────────────────────

type PoShow = 'OPEN' | 'ALL' | ClientPo['status'];

export function PurchaseOrdersView({ clientId, onClientChange }: { clientId?: number | null; onClientChange?: (id: number | null) => void }) {
  const { canWrite } = useRoles();
  const invalidate = useInvalidate();
  const { data, isLoading } = useClientPos();
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [show, setShow] = useState<PoShow>('OPEN'); const [client, setClient] = useState('ALL');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'po_date', desc: true }]);
  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState<ClientPo | null>(null);
  const [invoiceFor, setInvoiceFor] = useState<ClientPo | null>(null); const [del, setDel] = useState<ClientPo | null>(null);
  useEffect(() => { if (clientId) setClient(String(clientId)); }, [clientId]);

  const clients = useMemo(() => [...new Map((data ?? []).map((r) => [r.client_id, r.client_name ?? ''])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [data]);
  const rows = useMemo(() => (data ?? []).filter((r) => (show === 'ALL' || r.status === show) && (client === 'ALL' || String(r.client_id) === client)), [data, show, client]);

  const columns = useMemo<ColumnDef<ClientPo, any>[]>(() => [
    { accessorKey: 'po_number', header: 'PO number', size: 130, cell: ({ row }) => <IdCell value={row.original.po_number} /> },
    {
      accessorKey: 'client_name', header: 'Client',
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[220px]">
          <TextCell value={row.original.client_name} strong className="block truncate" />
          <TextCell value={[row.original.project_name, row.original.build_order_code].filter(Boolean).join(' · ')} muted className="block truncate text-[12px]" />
        </div>
      ),
    },
    { accessorKey: 'po_date', header: 'PO date', size: 110, cell: ({ row }) => <DateCell value={row.original.po_date} /> },
    { accessorKey: 'value', header: headerRight('Value'), size: 120, cell: ({ row }) => <WholeCell symbol value={row.original.value} /> },
    { accessorKey: 'invoiced', header: headerRight('Invoiced'), size: 120, cell: ({ row }) => <WholeCell symbol value={row.original.invoiced} /> },
    { accessorKey: 'balance', header: headerRight('Balance'), size: 120, cell: ({ row }) => <WholeCell symbol value={row.original.balance} /> },
    {
      id: 'status', header: 'Status', size: 110, accessorFn: (r) => (r.status === 'OPEN' ? (r.expired ? 0 : 1) : 2),
      cell: ({ row }) => { const s = PO_STATUS[row.original.status]; return <ToneText label={row.original.expired ? 'Expired' : s.label} tone={row.original.expired ? 'warning' : s.tone} />; },
    },
  ], []);

  const table = useDataTable({
    data: rows, columns, state: { sorting, rowSelection: selection }, onSortingChange: setSorting, getRowId: (r) => String(r.id),
    enableRowSelection: true, enableMultiRowSelection: false, onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getColumnCanGlobalFilter: () => true, getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const selected = rows.find((r) => String(r.id) === Object.keys(selection)[0]) ?? null;
  const detail = useClientPo(selected?.id ?? null).data;

  const act = async (job: () => Promise<unknown>, ok: string) => {
    try { await job(); toast.success(ok); invalidate('invoicing'); } catch (e: any) { toast.error(e?.message || 'Could not save.'); }
  };

  const alwaysActions: DetailActionDef[] = canWrite ? [{ label: 'Add PO', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setEditing(null); setFormOpen(true); } }] : [];
  const open = selected?.status === 'OPEN';
  const itemActions: DetailActionDef[] = !selected || !canWrite ? [] : [
    ...(open ? [{ label: 'New invoice', variant: 'primary' as const, icon: <FileText className="h-4 w-4 text-[var(--nav-cyan)]" />, onClick: () => setInvoiceFor(selected) }] : []),
    ...(open ? [{ label: 'Edit', icon: <Pencil className="h-4 w-4 text-[var(--info)]" />, onClick: () => { setEditing(selected); setFormOpen(true); } }] : []),
    ...(open ? [{ label: 'Close', icon: <CircleCheck className="h-4 w-4 text-[var(--nav-violet)]" />, onClick: () => act(() => api.post(`/client-pos/${selected.id}/close`, {}), 'PO closed.') }] : []),
    ...(selected.status === 'CLOSED' ? [{ label: 'Reopen', icon: <Undo2 className="h-4 w-4 text-[var(--nav-violet)]" />, onClick: () => act(() => api.post(`/client-pos/${selected.id}/reopen`, {}), 'PO reopened.') }] : []),
    ...(selected.status !== 'CANCELLED' && selected.invoice_count === 0 ? [{ label: 'Cancel PO', icon: <Ban className="h-4 w-4 text-[var(--nav-rose)]" />, onClick: () => act(() => api.post(`/client-pos/${selected.id}/cancel`, {}), 'PO cancelled.') }] : []),
    ...(selected.invoice_count === 0 ? [{ label: 'Delete', variant: 'danger' as const, icon: <Trash2 className="h-4 w-4 text-[var(--danger)]" />, onClick: () => setDel(selected) }] : []),
  ];
  const panelActions = itemActions.slice(0, 3);
  const exportPos = () => downloadCsv('client-purchase-orders.csv', toCsv(['po_number', 'client', 'po_date', 'value', 'invoiced', 'balance', 'status'], (data ?? []).map((r) => [r.po_number, r.client_name ?? '', r.po_date, r.value, r.invoiced, r.balance, PO_STATUS[r.status].label])));

  const live = (data ?? []).filter((r) => r.status === 'OPEN');
  const summary = (
    <div className="space-y-4">
      <DetailSummary title="Open purchase orders" subtitle="What clients have ordered and what is left to invoice" figure={live.length} figureLabel="Open POs" />
      <DetailSection title="Left to invoice">
        <DetailGrid>
          <DetailField label="PO value" value={money(live.reduce((a, r) => a + r.value, 0))} />
          <DetailField label="Invoiced" value={money(live.reduce((a, r) => a + r.invoiced, 0))} />
          <DetailField label="Balance" value={money(live.reduce((a, r) => a + r.balance, 0))} wide />
          <DetailField label="Past valid-until date" value={live.filter((r) => r.expired).length} tone={live.some((r) => r.expired) ? 'warning' : 'muted'} wide />
        </DetailGrid>
      </DetailSection>
      <p className="text-[12px] text-[var(--shell-text-muted)]">A PO closes by itself when it has been invoiced in full. Select one to raise an invoice against it.</p>
    </div>
  );

  const d = detail && detail.id === selected?.id ? detail : null;
  const usedPct = selected && selected.value > 0 ? Math.min(100, (selected.invoiced / selected.value) * 100) : 0;
  const panel = !selected ? null : (
    <div className="space-y-4">
      <DetailSummary title={selected.po_number} subtitle={selected.client_name ?? undefined} status={selected.expired ? 'Expired' : PO_STATUS[selected.status].label} statusClass={TONE_CLASS[selected.expired ? 'warning' : PO_STATUS[selected.status].tone]} figure={money(selected.value)} figureLabel="PO value" />
      <div>
        <div role="progressbar" aria-label="Invoiced of the PO" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usedPct)} className="h-2 overflow-hidden rounded-md bg-[var(--shell-hover)]"><div className="h-full rounded-md" style={{ width: `${usedPct}%`, background: 'var(--chart-1)' }} /></div>
        <p className="mt-1.5 text-[12px] tabular-nums text-[var(--shell-text-muted)]">{money(selected.invoiced)} invoiced · {money(selected.balance)} left{selected.draft_count ? ` · ${selected.draft_count} draft${selected.draft_count === 1 ? '' : 's'}` : ''}</p>
      </div>
      <DetailSection title="Purchase order">
        <DetailGrid>
          <DetailField label="PO date" value={formatDate(selected.po_date)} />
          <DetailField label="Valid until" value={selected.valid_until ? formatDate(selected.valid_until) : undefined} tone={selected.expired ? 'warning' : 'muted'} />
          <DetailField label="Project" value={selected.project_name ?? undefined} />
          <DetailField label="Order" value={selected.build_order_id ? <RecordLink href={`/business/orders/${selected.build_order_id}`}>{selected.build_order_code}</RecordLink> : undefined} />
        </DetailGrid>
        {selected.file_path && <button type="button" onClick={() => openFile(selected.file_path!)} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--shell-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]"><Paperclip aria-hidden className="h-4 w-4" />View the client&apos;s PO</button>}
        {selected.auto_closed && <p className="text-[12px] text-[var(--shell-text-muted)]">Closed by itself when it was invoiced in full.</p>}
      </DetailSection>
      <DetailSection title={`Invoices${d ? ` (${d.invoices?.length ?? 0})` : ''}`}>
        {d?.invoices?.length ? (
          <ul className="space-y-1.5">
            {d.invoices.map((i) => (
              <li key={i.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                <RecordLink href={`/manage/clients/invoices/${i.id}`}>{i.number ?? 'Draft'}</RecordLink>
                <span className="shrink-0 tabular-nums text-[var(--shell-text-muted)]">{money(i.total)} · <span className={TONE_CLASS[INVOICE_STATUS[i.status].tone]}>{INVOICE_STATUS[i.status].label}</span></span>
              </li>
            ))}
          </ul>
        ) : <p className="text-[12px] text-[var(--shell-text-muted)]">Nothing invoiced against this PO yet.</p>}
      </DetailSection>
      {selected.note && <DetailSection title="Note"><p className="text-[13px] text-[var(--shell-text)]">{selected.note}</p></DetailSection>}
    </div>
  );

  const filterDefs: FilterDef[] = [
    { id: 'show', label: 'PO status', value: show, onChange: (v) => setShow(v as PoShow), options: [{ value: 'OPEN', label: 'Open POs' }, { value: 'ALL', label: 'All POs' }, { value: 'CLOSED', label: 'Closed' }, { value: 'CANCELLED', label: 'Cancelled' }] },
    { id: 'client', label: 'Client', value: client, onChange: (v) => { setClient(v); onClientChange?.(v === 'ALL' ? null : Number(v)); }, options: [{ value: 'ALL', label: 'All clients' }, ...clients.map(([id, name]) => ({ value: String(id), label: name }))] },
  ];

  return (
    <ModuleShell
      showPanel={!!selected}
      searchRow={<DataTableToolbar table={table} filterDefs={filterDefs} onExport={exportPos} actions={<><ToolbarActions actions={alwaysActions} /><ToolbarActions actions={itemActions} /></>} />}
      intelligencePanel={
        <ModuleIntelligencePanel title={selected ? 'Purchase order' : 'Summary'} onClose={() => setSelection({})} hasSelection={!!selected} idle={summary} footer={panelActions.length ? <DetailActions actions={panelActions} /> : undefined}>
          {panel}
        </ModuleIntelligencePanel>
      }
    >
      <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table} emptyMessage={show === 'OPEN' ? (canWrite ? 'No open purchase orders. Use Add PO when a client sends one, or set the filter to All POs.' : 'No open purchase orders.') : 'No purchase orders match the filters.'} />
      <PoModal isOpen={formOpen} onClose={() => setFormOpen(false)} editing={editing} clientId={clientId} />
      <InvoiceModalForPo po={invoiceFor} onClose={() => setInvoiceFor(null)} />
      <ConfirmDialog open={!!del} destructive title="Delete purchase order" confirmLabel="Delete" message={`Delete PO ${del?.po_number}? Nothing has been invoiced against it.`} onCancel={() => setDel(null)}
        onConfirm={() => { const r = del; setDel(null); if (!r) return; setSelection({}); act(() => api.delete(`/client-pos/${r.id}`), 'PO deleted.'); }} />
    </ModuleShell>
  );
}

function InvoiceModalForPo({ po, onClose }: { po: ClientPo | null; onClose: () => void }) {
  return <InvoiceModal isOpen={!!po} onClose={onClose} editing={null} poId={po?.id ?? null} clientId={po?.client_id ?? null} />;
}

// ── Invoices tab ───────────────────────────────────────────────────────────────

type InvShow = 'ALL' | 'UNPAID' | 'OVERDUE' | InvoiceStatus;
// Overdue first, then part paid, issued, draft, paid, cancelled
const rankOf = (i: Invoice) => (i.overdue ? 0 : i.status === 'PART_PAID' ? 1 : i.status === 'ISSUED' ? 2 : i.status === 'DRAFT' ? 3 : i.status === 'PAID' ? 4 : 5);
const statusOf = (i: Invoice) => (i.overdue ? { label: `Overdue ${i.days_overdue} ${i.days_overdue === 1 ? 'day' : 'days'}`, tone: 'danger' as const } : INVOICE_STATUS[i.status]);

export function InvoicesView({ clientId, onClientChange }: { clientId?: number | null; onClientChange?: (id: number | null) => void }) {
  const router = useRouter();
  const { canWrite, canMoney } = useRoles();
  const invalidate = useInvalidate();
  const { data, isLoading } = useInvoices();
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [show, setShow] = useState<InvShow>('ALL'); const [client, setClient] = useState('ALL');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'attention', desc: false }]);
  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState<Invoice | null>(null);
  const [payFor, setPayFor] = useState<Invoice | null>(null); const [cancelFor, setCancelFor] = useState<Invoice | null>(null);
  const [del, setDel] = useState<Invoice | null>(null); const [issue, setIssue] = useState<Invoice | null>(null); const [unpay, setUnpay] = useState<{ inv: Invoice; id: number } | null>(null);
  useEffect(() => { if (clientId) setClient(String(clientId)); }, [clientId]);

  const clients = useMemo(() => [...new Map((data ?? []).map((r) => [r.client_id, r.client_name ?? ''])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [data]);
  const rows = useMemo(() => (data ?? []).filter((r) =>
    (show === 'ALL' || (show === 'UNPAID' ? ['ISSUED', 'PART_PAID'].includes(r.status) : show === 'OVERDUE' ? r.overdue : r.status === show)) && (client === 'ALL' || String(r.client_id) === client)), [data, show, client]);

  const columns = useMemo<ColumnDef<Invoice, any>[]>(() => [
    { accessorKey: 'number', header: 'Invoice', size: 150, cell: ({ row }) => row.original.number ? <IdCell value={row.original.number} /> : <TextCell value="Draft" muted /> },
    {
      accessorKey: 'client_name', header: 'Client',
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[200px]">
          <TextCell value={row.original.client_name} strong className="block truncate" />
          <TextCell value={row.original.po_number ? `PO ${row.original.po_number}` : ''} muted className="block truncate text-[12px]" />
        </div>
      ),
    },
    { accessorKey: 'invoice_date', header: 'Date', size: 105, cell: ({ row }) => <DateCell value={row.original.invoice_date} /> },
    { accessorKey: 'due_date', header: 'Due', size: 105, cell: ({ row }) => <DateCell value={row.original.due_date} /> },
    { accessorKey: 'total', header: headerRight('Total'), size: 115, cell: ({ row }) => <WholeCell symbol value={row.original.total} /> },
    { accessorKey: 'balance', header: headerRight('Balance'), size: 115, cell: ({ row }) => <WholeCell symbol value={row.original.balance} /> },
    { id: 'attention', header: 'Status', size: 130, accessorFn: (r) => rankOf(r), cell: ({ row }) => { const s = statusOf(row.original); return <ToneText label={s.label} tone={s.tone} />; } },
  ], []);

  const table = useDataTable({
    data: rows, columns, state: { sorting, rowSelection: selection }, onSortingChange: setSorting, getRowId: (r) => String(r.id),
    enableRowSelection: true, enableMultiRowSelection: false, onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getColumnCanGlobalFilter: () => true, getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const selected = rows.find((r) => String(r.id) === Object.keys(selection)[0]) ?? null;
  const detail = useInvoice(selected?.id ?? null).data;
  const d = detail && detail.id === selected?.id ? detail : null;
  const { data: summaryData } = useInvoiceSummary();

  const act = async (job: () => Promise<unknown>, ok: string) => {
    try { await job(); toast.success(ok); invalidate('invoicing', 'clients', 'transactions', 'dashboard'); } catch (e: any) { toast.error(e?.message || 'Could not save.'); }
  };

  const alwaysActions: DetailActionDef[] = canWrite ? [{ label: 'New invoice', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setEditing(null); setFormOpen(true); } }] : [];
  const live = selected && ['ISSUED', 'PART_PAID'].includes(selected.status);
  const itemActions: DetailActionDef[] = !selected ? [] : [
    { label: 'Open', variant: selected.status === 'DRAFT' ? undefined : 'primary', icon: <FolderOpen className="h-4 w-4 text-[var(--nav-slate)]" />, onClick: () => router.push(`/manage/clients/invoices/${selected.id}`) },
    ...(selected.status === 'DRAFT' && canMoney ? [{ label: 'Issue', variant: 'primary' as const, icon: <Send className="h-4 w-4 text-[var(--nav-indigo)]" />, onClick: () => setIssue(selected) }] : []),
    ...(live && canMoney ? [{ label: 'Record payment', variant: 'primary' as const, icon: <CreditCard className="h-4 w-4 text-[var(--nav-amber)]" />, onClick: () => setPayFor(selected) }] : []),
    ...(selected.status === 'DRAFT' && canWrite ? [{ label: 'Edit', icon: <Pencil className="h-4 w-4 text-[var(--info)]" />, disabled: !d, onClick: () => { setEditing(d); setFormOpen(true); } }] : []),
    ...(live && canMoney && selected.paid === 0 && selected.tds === 0 ? [{ label: 'Cancel invoice', icon: <Ban className="h-4 w-4 text-[var(--nav-rose)]" />, onClick: () => setCancelFor(selected) }] : []),
    ...(selected.status === 'DRAFT' && canWrite ? [{ label: 'Delete', variant: 'danger' as const, icon: <Trash2 className="h-4 w-4 text-[var(--danger)]" />, onClick: () => setDel(selected) }] : []),
  ];
  const panelActions = [...itemActions.filter((a) => a.variant === 'primary'), ...itemActions.filter((a) => a.variant !== 'primary')].slice(0, 3);
  const exportInvoices = () => downloadCsv('invoices.csv', toCsv(['invoice', 'client', 'po', 'invoice_date', 'due_date', 'taxable', 'cgst', 'sgst', 'igst', 'total', 'received', 'tds', 'balance', 'status'], (data ?? []).map((r) => [r.number ?? 'Draft', r.client_name ?? '', r.po_number ?? '', r.invoice_date, r.due_date, r.taxable, r.cgst, r.sgst, r.igst, r.total, r.paid, r.tds, r.balance, statusOf(r).label])));

  const t = summaryData?.totals;
  const summary = (
    <div className="space-y-4">
      <DetailSummary title="Receivables" subtitle="What clients owe on issued invoices" figure={t ? money(t.outstanding) : '—'} figureLabel="Outstanding" />
      <DetailSection title="Where it stands">
        <DetailGrid>
          <DetailField label="Billed" value={t ? money(t.billed) : undefined} />
          <DetailField label="Received" value={t ? money(t.received) : undefined} />
          <DetailField label="Overdue" value={t ? money(t.overdue) : undefined} tone={t && t.overdue > 0 ? 'danger' : 'muted'} />
          <DetailField label="Overdue invoices" value={t?.overdue_count} tone={t && t.overdue_count > 0 ? 'danger' : 'muted'} />
          <DetailField label="Drafts" value={(data ?? []).filter((r) => r.status === 'DRAFT').length} wide />
        </DetailGrid>
      </DetailSection>
      <p className="text-[12px] text-[var(--shell-text-muted)]">Billed is the total of issued invoices. Received includes the TDS clients deducted. An invoice is overdue once it is past its due date with money still owed.</p>
    </div>
  );

  const panel = !selected ? null : (
    <div className="space-y-4">
      <DetailSummary title={selected.number ?? 'Draft invoice'} subtitle={selected.client_name ?? undefined} status={statusOf(selected).label} statusClass={TONE_CLASS[statusOf(selected).tone]} figure={money(selected.total)} figureLabel="Invoice total" />
      {live && <p className="text-[13px] tabular-nums text-[var(--shell-text-muted)]">{money(selected.balance)} still to receive{selected.overdue ? `, ${selected.days_overdue} days past the due date` : ''}.</p>}
      <DetailSection title="Invoice">
        <DetailGrid>
          <DetailField label="Invoice date" value={formatDate(selected.invoice_date)} />
          <DetailField label="Due date" value={formatDate(selected.due_date)} tone={selected.overdue ? 'danger' : 'muted'} />
          <DetailField label="PO" value={selected.po_number ?? undefined} />
          <DetailField label="Project" value={selected.project_name ?? undefined} />
          {selected.build_order_id && <DetailField label="Order" value={<RecordLink href={`/business/orders/${selected.build_order_id}`}>{selected.build_order_code}</RecordLink>} wide />}
        </DetailGrid>
      </DetailSection>
      <DetailSection title="Amount">
        <DetailGrid>
          <DetailField label="Taxable value" value={money(selected.taxable)} />
          {selected.supply_type === 'INTER' ? <DetailField label="IGST" value={money(selected.igst)} /> : <><DetailField label="CGST" value={money(selected.cgst)} /><DetailField label="SGST" value={money(selected.sgst)} /></>}
          <DetailField label="Round-off" value={selected.round_off.toFixed(2)} />
          <DetailField label="Place of supply" value={selected.place_of_supply ?? undefined} wide />
        </DetailGrid>
      </DetailSection>
      {d && d.lines.length > 0 && (
        <DetailSection title={`Lines (${d.lines.length})`}>
          <ul className="space-y-1">
            {d.lines.map((l) => <li key={l.id} className="flex items-baseline justify-between gap-3 text-[13px]"><span className="min-w-0 truncate text-[var(--shell-text)]">{l.description}</span><span className="shrink-0 tabular-nums text-[var(--shell-text-muted)]">{money(l.taxable ?? 0)}</span></li>)}
          </ul>
        </DetailSection>
      )}
      {d && ['PART_PAID', 'PAID', 'ISSUED'].includes(selected.status) && (
        <DetailSection title="Payments">
          {d.payments.length ? (
            <ul className="space-y-1.5">
              {d.payments.map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 text-[var(--shell-text)]">{formatDate(p.paid_on)}{p.reference ? <span className="text-[var(--shell-text-muted)]"> · {p.reference}</span> : null}</span>
                  <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                    <span className="text-[var(--shell-text)]">{money(p.amount)}{p.tds ? <span className="text-[var(--shell-text-muted)]"> + {money(p.tds)} TDS</span> : null}</span>
                    {canMoney && <button type="button" onClick={() => setUnpay({ inv: selected, id: p.id })} className="text-[12px] font-medium text-[var(--danger)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]">Remove</button>}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[12px] text-[var(--shell-text-muted)]">No payment has been recorded.</p>}
        </DetailSection>
      )}
      {selected.cancel_reason && <DetailSection title="Cancelled"><p className="text-[13px] text-[var(--shell-text)]">{selected.cancel_reason}</p></DetailSection>}
      {selected.notes && <DetailSection title="Notes"><p className="text-[13px] text-[var(--shell-text)]">{selected.notes}</p></DetailSection>}
    </div>
  );

  const filterDefs: FilterDef[] = [
    { id: 'show', label: 'Invoice status', value: show, onChange: (v) => setShow(v as InvShow), options: [{ value: 'ALL', label: 'All invoices' }, { value: 'UNPAID', label: 'Unpaid' }, { value: 'OVERDUE', label: 'Overdue' }, { value: 'DRAFT', label: 'Draft' }, { value: 'PAID', label: 'Paid' }, { value: 'CANCELLED', label: 'Cancelled' }] },
    { id: 'client', label: 'Client', value: client, onChange: (v) => { setClient(v); onClientChange?.(v === 'ALL' ? null : Number(v)); }, options: [{ value: 'ALL', label: 'All clients' }, ...clients.map(([id, name]) => ({ value: String(id), label: name }))] },
  ];

  return (
    <ModuleShell
      showPanel={!!selected}
      searchRow={<DataTableToolbar table={table} filterDefs={filterDefs} onExport={exportInvoices} actions={<><ToolbarActions actions={alwaysActions} /><ToolbarActions actions={itemActions} /></>} />}
      intelligencePanel={
        <ModuleIntelligencePanel title={selected ? 'Invoice' : 'Receivables'} onClose={() => setSelection({})} hasSelection={!!selected} idle={summary} footer={panelActions.length ? <DetailActions actions={panelActions} /> : undefined}>
          {panel}
        </ModuleIntelligencePanel>
      }
    >
      <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table} emptyMessage={show === 'ALL' ? (canWrite ? 'No invoices yet. Use New invoice, or open a purchase order and raise one from it.' : 'No invoices yet.') : 'No invoices match the filters.'} />
      <InvoiceModal isOpen={formOpen} onClose={() => setFormOpen(false)} editing={editing} clientId={clientId} />
      <PaymentModal isOpen={!!payFor} onClose={() => setPayFor(null)} invoice={payFor} />
      <CancelInvoiceModal isOpen={!!cancelFor} onClose={() => setCancelFor(null)} invoice={cancelFor} />
      <ConfirmDialog open={!!del} destructive title="Delete draft invoice" confirmLabel="Delete" message="Delete this draft? It has no number yet, so nothing is lost from the invoice sequence." onCancel={() => setDel(null)}
        onConfirm={() => { const r = del; setDel(null); if (!r) return; setSelection({}); act(() => api.delete(`/invoices/${r.id}`), 'Draft deleted.'); }} />
      <ConfirmDialog open={!!issue} title="Issue invoice" confirmLabel="Issue" message={`Issue this invoice to ${issue?.client_name}? It gets the next number and can no longer be edited, only cancelled. The tax is worked out from the states of both parties.`} onCancel={() => setIssue(null)}
        onConfirm={() => { const r = issue; setIssue(null); if (r) act(() => api.post(`/invoices/${r.id}/issue`, {}), 'Invoice issued.'); }} />
      <ConfirmDialog open={!!unpay} destructive title="Remove payment" confirmLabel="Remove" message="Remove this payment? The income entry it made is voided and the invoice balance goes back up." onCancel={() => setUnpay(null)}
        onConfirm={() => { const r = unpay; setUnpay(null); if (r) act(() => api.delete(`/invoices/${r.inv.id}/payments/${r.id}`), 'Payment removed.'); }} />
    </ModuleShell>
  );
}
