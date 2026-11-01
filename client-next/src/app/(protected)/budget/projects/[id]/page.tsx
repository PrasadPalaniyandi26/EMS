'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Flag, Settings2, CheckCheck, RefreshCw, XCircle, TrendingUp } from 'lucide-react';
import { ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import api from '@/lib/api-client';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useInvalidate } from '@/hooks/use-queries';
import { useJobBom, useProjectBudget, type BaselineRow, type BomLineRow, type EstimateLineRow, type Milestone, type OperationRow } from '@/hooks/use-planning-queries';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { DateCell, TextCell, ToneText, headerRight } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { ConfirmDialog } from '@/components/shared/modal-primitives';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { BomLineModal, BomSettingsModal, BuildStepModal, EstimateLineModal, EstimatePhasesModal, MilestoneModal, ProjectSettingsModal, RejectBaselineModal, StepTypesModal } from '@/components/budgets/planning-modals';
import { TabBar, money } from '@/components/budgets/budget-ui';
import { EvmModal } from '@/components/budgets/evm-panel';
import { formatDate } from '@/lib/currency';
import { cn } from '@/lib/utils';

type Tab = 'estimate' | 'baselines' | 'jobbom' | 'jobsteps' | 'milestones' | 'evm';
type Measure = { id: string; name: string; value: string; tone?: 'warning' | 'danger'; meaning: string };

const JOB_TABS: { value: Tab; label: string }[] = [{ value: 'jobbom', label: 'Job BOM' }, { value: 'jobsteps', label: 'Job build operations' }];
const TABS: { value: Tab; label: string }[] = [{ value: 'estimate', label: 'Estimate' }, { value: 'baselines', label: 'Baselines' }, { value: 'milestones', label: 'Milestones' }, { value: 'evm', label: 'Earned value' }];
const EMPTY: Record<Tab, string> = {
  jobbom: 'No parts yet. Click Add part to build the job: parts from the Part master and standard products as sub-assemblies.',
  jobsteps: 'No build operations yet. Click Add build operation for the work done in house or outsourced.',
  estimate: 'No estimate lines yet. Click Add line to enter what the project will cost, phase by phase. Labour can use the rate card.',
  baselines: 'No baseline proposed yet. Click Propose baseline to send the estimate for approval. The approved baseline is what earned value is measured against.',
  milestones: 'No milestones yet. Weights add up to 100% and drive the earned value.',
  evm: 'Build an estimate first; earned value is measured against it.',
};

const Num = ({ children, strong }: { children: React.ReactNode; strong?: boolean }) => (
  <div className={cn('text-right text-[13px] tabular-nums text-[var(--shell-text)]', strong && 'font-medium')}>{children}</div>
);
const late = (m: Milestone) => !m.done_date && new Date(m.planned_date) < new Date();

export default function ProjectBudgetPage() {
  const id = Number(useParams<{ id: string }>().id);
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  const role = (user?.role_name || '').toUpperCase();
  const isFinance = role === 'ADMIN' || role === 'FINANCE';
  const invalidate = useInvalidate();
  const { data, isLoading } = useProjectBudget(id);
  const hasJob = !!data?.project.has_job_bom;
  const { data: job } = useJobBom(id, hasJob);
  const tabs = useMemo(() => (hasJob ? [TABS[0], ...JOB_TABS, ...TABS.slice(1)] : TABS), [hasJob]);
  const [tab, setTab] = useState<Tab>('estimate');
  const [partOpen, setPartOpen] = useState(false); const [editPart, setEditPart] = useState<BomLineRow | null>(null); const [delPart, setDelPart] = useState<BomLineRow | null>(null);
  const [stepOpen, setStepOpen] = useState(false); const [editStep, setEditStep] = useState<OperationRow | null>(null); const [delStep, setDelStep] = useState<OperationRow | null>(null);
  const [typesOpen, setTypesOpen] = useState(false); const [freightOpen, setFreightOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [lineOpen, setLineOpen] = useState(false); const [editLine, setEditLine] = useState<EstimateLineRow | null>(null);
  const [msOpen, setMsOpen] = useState(false); const [editMs, setEditMs] = useState<Milestone | null>(null);
  const [setOpen, setSetOpen] = useState(false);
  const [delLine, setDelLine] = useState<EstimateLineRow | null>(null); const [delMs, setDelMs] = useState<Milestone | null>(null);
  const [baselineOpen, setBaselineOpen] = useState(false); const [phasesOpen, setPhasesOpen] = useState(false);
  const [evmOpen, setEvmOpen] = useState(false); const [apprBase, setApprBase] = useState<BaselineRow | null>(null); const [rejBase, setRejBase] = useState<BaselineRow | null>(null);

  useEffect(() => { setHeader(data ? `${data.project.code ?? ''} ${data.project.name}`.trim() : 'Project costing', data?.project.client_name ?? 'Estimate, margin and progress'); }, [setHeader, data]);

  const act = async (job: () => Promise<unknown>, ok: string) => {
    try { await job(); toast.success(ok); invalidate('budgets'); } catch (err: any) { toast.error(err?.message || 'Could not complete that.'); }
  };

  const m = data?.margin; const est = data?.estimate ?? null; const t = data?.totals; const e = data?.evm;
  const baseline = data?.baseline ?? null;
  const proposed = data?.baselines.find((b) => b.status === 'PROPOSED') ?? null;
  const marginTone = !m || m.estimate_margin_pct == null ? undefined : m.estimate_margin_pct < 0 ? 'danger' : m.target_pct != null && m.estimate_margin_pct < m.target_pct ? 'warning' : undefined;
  const weightLeft = e ? Math.max(0, Math.round((100 - e.weight_total) * 100) / 100) : 100;

  const measures = useMemo<Measure[]>(() => {
    if (!e || !est) return [];
    return [
      { id: 'pv', name: 'Planned value', value: money(e.pv, currency), meaning: `${e.percent_planned}% of the budget planned by today. From milestone weights and planned dates (Milestones tab)` },
      { id: 'ev', name: 'Earned value', value: money(e.ev, currency), meaning: `${e.percent_complete}% of the budget done. From milestones marked done (Milestones tab)` },
      { id: 'ac', name: 'Actual cost', value: money(e.ac, currency), tone: e.ac > e.ev ? 'warning' : undefined, meaning: e.last_spend ? `Approved expenses booked to the project, latest in ${e.last_spend}` : 'Approved expenses booked to the project: none yet' },
      { id: 'cpi', name: 'CPI', value: e.cpi != null ? e.cpi.toFixed(2) : '–', tone: e.cpi != null && e.cpi < 0.9 ? 'danger' : e.cpi != null && e.cpi < 0.95 ? 'warning' : undefined, meaning: e.spend_low ? 'Spend looks incomplete: work done is worth over four times what is booked' : 'Cost efficiency: earned ÷ spent' },
      { id: 'spi', name: 'SPI', value: e.spi != null ? e.spi.toFixed(2) : '–', tone: e.spi != null && e.spi < 0.9 ? 'warning' : undefined, meaning: 'Schedule index: earned ÷ planned. Below 1 is behind, above 1 is ahead' },
      { id: 'eac', name: 'EAC', value: money(e.eac, currency), tone: e.eac > e.bac ? 'warning' : undefined, meaning: e.spend_low ? 'Forecast at completion. Held at the budget until spend catches up with progress' : 'Forecast cost at completion: budget ÷ cost index' },
      { id: 'etc', name: 'ETC', value: money(e.etc, currency), meaning: 'Still to spend: forecast at completion less actual cost' },
      { id: 'vac', name: 'VAC', value: money(e.vac, currency), tone: e.vac < 0 ? 'danger' : undefined, meaning: 'Budget less forecast at completion. Negative means the forecast overruns the budget' },
    ];
  }, [e, est, currency]);

  const rows = useMemo<any[]>(() => (!data ? [] : tab === 'estimate' ? (est ? data.lines : []) : tab === 'baselines' ? data.baselines : tab === 'jobbom' ? job?.lines ?? [] : tab === 'jobsteps' ? job?.operations ?? [] : tab === 'milestones' ? data.milestones : measures), [data, est, job, tab, measures]);

  const columns = useMemo<ColumnDef<any, any>[]>(() => {
    if (tab === 'jobbom') return [
      { accessorKey: 'part_no', header: 'Part', cell: ({ row }) => <TextCell value={row.original.part_no} muted />, size: 110 },
      { accessorKey: 'name', header: 'Name', cell: ({ row }) => <TextCell value={row.original.name} strong className="block max-w-[320px] truncate" /> },
      { id: 'source', header: 'Source', cell: ({ row }) => <TextCell value={row.original.sub_product_id ? 'Standard product' : row.original.sourcing === 'MAKE' ? 'Make' : 'Buy'} muted />, size: 130 },
      { accessorKey: 'quantity', header: headerRight('Qty'), cell: ({ row }) => <Num>{row.original.quantity}</Num>, size: 80 },
      { accessorKey: 'scrap_pct', header: headerRight('Scrap'), cell: ({ row }) => <Num>{row.original.scrap_pct}%</Num>, size: 80 },
      { accessorKey: 'unit_cost', header: headerRight('Unit cost'), cell: ({ row }) => <Num>{money(row.original.unit_cost, currency)}</Num>, size: 120 },
      { accessorKey: 'amount', header: headerRight('Amount'), cell: ({ row }) => <Num strong>{money(row.original.amount, currency)}</Num>, size: 120 },
      { id: 'standard', header: 'Standard', size: 120, cell: ({ row }) => row.original.sub_drift ? <ToneText label="Changed" tone="warning" /> : <TextCell value={row.original.sub_product_id ? 'Current' : ''} muted /> },
    ];
    if (tab === 'jobsteps') return [
      { accessorKey: 'type_name', header: 'Operation', cell: ({ row }) => <TextCell value={row.original.type_name} strong />, size: 200 },
      { accessorKey: 'role', header: 'Role', cell: ({ row }) => <TextCell value={row.original.role ?? '—'} muted />, size: 180 },
      { id: 'labour', header: headerRight('Labour'), cell: ({ row }) => <Num>{(row.original.is_outsourced || row.original.is_fixed) ? '—' : money(row.original.hours * row.original.rate, currency)}</Num>, size: 110 },
      { accessorKey: 'outsourced_cost', header: headerRight('Outsourced'), cell: ({ row }) => <Num>{row.original.outsourced_cost != null ? money(row.original.outsourced_cost, currency) : '—'}</Num>, size: 120 },
      { accessorKey: 'fixed_cost', header: headerRight('Fixed'), cell: ({ row }) => <Num>{row.original.fixed_cost != null ? money(row.original.fixed_cost, currency) : '—'}</Num>, size: 110 },
      { accessorKey: 'amount', header: headerRight('Direct cost'), cell: ({ row }) => <Num>{money(row.original.amount, currency)}</Num>, size: 120 },
      { id: 'overhead', header: headerRight('Overhead'), cell: ({ row }) => <Num>{(row.original.is_outsourced || row.original.is_fixed) ? '—' : money(row.original.hours * (job?.cost?.overhead_rate ?? 0), currency)}</Num>, size: 110 },
      { id: 'total', header: headerRight('Total'), cell: ({ row }) => <Num strong>{money(row.original.amount + ((row.original.is_outsourced || row.original.is_fixed) ? 0 : row.original.hours * (job?.cost?.overhead_rate ?? 0)), currency)}</Num>, size: 120 },
    ];
    if (tab === 'estimate') return [
      { accessorKey: 'phase', header: 'Phase', cell: ({ row }) => <TextCell value={row.original.phase} muted />, size: 130 },
      { accessorKey: 'description', header: 'Description', cell: ({ row }) => <TextCell value={row.original.description} strong className="block max-w-[360px] truncate" /> },
      { accessorKey: 'type_label', header: 'Type', cell: ({ row }) => <TextCell value={row.original.type_label} muted />, size: 160 },
      { accessorKey: 'quantity', header: headerRight('Qty'), cell: ({ row }) => <Num>{row.original.quantity} {row.original.unit}</Num>, size: 100 },
      { accessorKey: 'rate', header: headerRight('Rate'), cell: ({ row }) => <Num>{money(row.original.rate, currency)}</Num>, size: 110 },
      { accessorKey: 'amount', header: headerRight('Amount'), cell: ({ row }) => <Num strong>{money(row.original.amount, currency)}</Num>, size: 120 },
    ];
    if (tab === 'baselines') return [
      { accessorKey: 'created_at', header: 'Proposed', cell: ({ row }) => <DateCell value={row.original.created_at} />, size: 110 },
      { accessorKey: 'proposed_by_name', header: 'By', cell: ({ row }) => <TextCell value={row.original.proposed_by_name ?? '—'} muted />, size: 130 },
      { accessorKey: 'line_count', header: headerRight('Lines'), cell: ({ row }) => <Num>{row.original.line_count}</Num>, size: 80 },
      { accessorKey: 'direct', header: headerRight('Direct cost'), cell: ({ row }) => <Num>{money(row.original.direct, currency)}</Num>, size: 130 },
      { accessorKey: 'total', header: headerRight('Total'), cell: ({ row }) => <Num strong>{money(row.original.total, currency)}</Num>, size: 130 },
      { accessorKey: 'status', header: 'Status', size: 120, cell: ({ row }) => { const s = row.original.status; return <ToneText label={s === 'APPROVED' ? 'Approved' : s === 'PROPOSED' ? 'Proposed' : s === 'REJECTED' ? 'Rejected' : 'Replaced'} tone={s === 'APPROVED' ? 'success' : s === 'PROPOSED' ? 'warning' : s === 'REJECTED' ? 'danger' : 'muted'} />; } },
    ];
    if (tab === 'milestones') return [
      { accessorKey: 'name', header: 'Milestone', cell: ({ row }) => <TextCell value={row.original.name} strong /> },
      { accessorKey: 'weight_pct', header: headerRight('Weight'), cell: ({ row }) => <Num>{row.original.weight_pct}%</Num>, size: 100 },
      { accessorKey: 'planned_date', header: 'Planned', cell: ({ row }) => <DateCell value={row.original.planned_date} />, size: 120 },
      { accessorKey: 'done_date', header: 'Status', size: 130,
        cell: ({ row }) => row.original.done_date ? <ToneText label={`Done ${formatDate(row.original.done_date)}`} tone="success" /> : <ToneText label={late(row.original) ? 'Late' : 'Open'} tone={late(row.original) ? 'warning' : 'muted'} /> },
    ];
    return [
      { accessorKey: 'name', header: 'Measure', cell: ({ row }) => <TextCell value={row.original.name} strong />, size: 160 },
      { accessorKey: 'value', header: headerRight('Value'), cell: ({ row }) => <div className="text-right"><ToneText label={row.original.value} tone={row.original.tone ?? 'muted'} /></div>, size: 140 },
      { accessorKey: 'meaning', header: 'Meaning', cell: ({ row }) => <TextCell value={row.original.meaning} muted /> },
    ];
  }, [tab, currency, job?.cost?.overhead_rate]);

  const table = useDataTable({
    data: rows, columns, state: { sorting, rowSelection: selection }, onSortingChange: setSorting, getRowId: (r) => String(r.id),
    enableRowSelection: tab !== 'evm', enableMultiRowSelection: false,
    onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const selected: any = rows.find((r) => String(r.id) === Object.keys(selection)[0]) ?? null;
  const switchTab = (x: Tab) => { setTab(x); setSelection({}); };

  const itemActions: DetailActionDef[] = !selected ? [] :
    tab === 'estimate' ? (selected.managed ? [] : [{ label: 'Edit', onClick: () => { setEditLine(selected); setLineOpen(true); } }, { label: 'Delete', variant: 'danger', onClick: () => setDelLine(selected) }]) :
    tab === 'baselines' ? (selected.status === 'PROPOSED' && isFinance ? [
      { label: 'Approve baseline', variant: 'primary' as const, icon: <CheckCheck className="h-4 w-4 text-[var(--success)]" />, onClick: () => setApprBase(selected) },
      { label: 'Reject', variant: 'danger' as const, icon: <XCircle className="h-4 w-4 text-[var(--danger)]" />, onClick: () => setRejBase(selected) },
    ] : []) :
    tab === 'jobbom' ? [
      ...(selected.sub_drift ? [{ label: 'Update to current standard', variant: 'primary' as const, icon: <RefreshCw className="h-4 w-4 text-[var(--shell-accent)]" />, onClick: () => act(() => api.post(`/budgets/job-bom/lines/${selected.id}/refresh`, {}), 'Priced at the current standard.') }] : []),
      { label: 'Edit', onClick: () => { setEditPart(selected); setPartOpen(true); } },
      { label: 'Delete', variant: 'danger', onClick: () => setDelPart(selected) },
    ] :
    tab === 'jobsteps' ? [{ label: 'Edit', onClick: () => { setEditStep(selected); setStepOpen(true); } }, { label: 'Delete', variant: 'danger', onClick: () => setDelStep(selected) }] :
    tab === 'milestones' ? [
      ...(!selected.done_date ? [{ label: 'Mark done', variant: 'primary' as const, icon: <CheckCheck className="h-4 w-4 text-[var(--success)]" />, onClick: () => act(() => api.put(`/budgets/projects/${id}/milestones/${selected.id}`, { name: selected.name, weight_pct: selected.weight_pct, planned_date: selected.planned_date.slice(0, 10), done_date: new Date().toISOString().slice(0, 10) }), 'Milestone marked done.') }] : []),
      { label: 'Edit', onClick: () => { setEditMs(selected); setMsOpen(true); } },
      { label: 'Delete', variant: 'danger', onClick: () => setDelMs(selected) },
    ] : [];

  const alwaysActions: DetailActionDef[] = [
    ...(tab === 'jobbom' ? [{ label: 'Add part', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setEditPart(null); setPartOpen(true); } }] : []),
    ...(tab === 'jobbom' && isFinance ? [{ label: 'Freight', icon: <Settings2 className="h-4 w-4 text-[var(--warning)]" />, onClick: () => setFreightOpen(true) }] : []),
    ...(tab === 'jobsteps' ? [{ label: 'Add build operation', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setEditStep(null); setStepOpen(true); } }] : []),
    ...(tab === 'jobsteps' && isFinance ? [{ label: 'Manage operation types', icon: <Settings2 className="h-4 w-4 text-[var(--warning)]" />, onClick: () => setTypesOpen(true) }] : []),
    ...(tab === 'estimate' ? [{ label: 'Add line', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setEditLine(null); setLineOpen(true); } }] : []),
    ...(tab === 'estimate' && isFinance ? [{ label: 'Manage phases', icon: <Settings2 className="h-4 w-4 text-[var(--nav-violet)]" />, onClick: () => setPhasesOpen(true) }] : []),
    ...(tab === 'baselines' && est && isFinance ? [{ label: 'Propose baseline', icon: <Flag className="h-4 w-4 text-[var(--shell-accent)]" />, onClick: () => setBaselineOpen(true) }] : []),
    ...(tab === 'milestones' ? [{ label: 'Add milestone', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setEditMs(null); setMsOpen(true); } }] : []),
    ...(tab === 'evm' && e && est ? [{ label: 'Chart', icon: <TrendingUp className="h-4 w-4 text-[var(--info)]" />, onClick: () => setEvmOpen(true) }] : []),
    { label: 'Contract and margin', icon: <Settings2 className="h-4 w-4 text-[var(--warning)]" />, onClick: () => setSetOpen(true) },
  ];

  const summary = !data || !m || !t || !e ? null : (
    <div className="space-y-4">
      <DetailSummary title={data.project.name} subtitle={data.project.code ?? undefined} status={!est ? 'No estimate yet' : baseline ? `Baseline ${money(baseline.total, currency)}, approved ${formatDate(baseline.approved_at)}` : proposed ? 'Baseline proposed, waiting for approval' : 'No baseline yet'}
        statusClass="text-[var(--shell-text-muted)]" figure={money(t.total, currency)} figureLabel="Estimate" />
      <DetailSection title="Estimate">
        <DetailGrid>
          <DetailField label="Direct cost" value={money(t.direct, currency)} />
          <DetailField label={`Contingency${est ? ` (${est.contingency_pct}%)` : ''}`} value={money(t.contingency, currency)} />
          <DetailField label={`Warranty${est ? ` (${est.warranty_pct}%)` : ''}`} value={money(t.warranty, currency)} />
          <DetailField label="Spent so far" value={money(e.ac, currency)} />
        </DetailGrid>
      </DetailSection>
      {baseline && data.changed_since_baseline && (
        <p className="text-[12px] text-[var(--warning)]">The estimate is {money(Math.abs(t.total - baseline.total), currency)} {t.total > baseline.total ? 'above' : 'below'} the approved baseline. Propose a new baseline to move it.</p>
      )}
      <DetailSection title="Margin">
        <DetailGrid>
          <DetailField label="Contract value" value={m.contract_value != null ? money(m.contract_value, currency) : 'Not set'} />
          <DetailField label="Target margin" value={m.target_pct != null ? `${m.target_pct}%` : 'Not set'} />
          <DetailField label="Profit at estimate" value={m.contract_value != null ? money(m.contract_value - t.total, currency) : '–'} tone={m.contract_value != null && m.contract_value < t.total ? 'danger' : 'muted'} />
          <DetailField label="Margin at estimate" value={m.estimate_margin_pct != null ? `${m.estimate_margin_pct.toFixed(1)}%` : '–'} tone={marginTone} />
          <DetailField wide label="Projected margin" value={m.projected_margin_pct != null ? `${m.projected_margin_pct.toFixed(1)}%` : '–'} tone={m.projected_margin_pct != null && m.projected_margin_pct < 0 ? 'danger' : 'muted'} />
        </DetailGrid>
        {m.estimate_margin_pct != null && m.target_pct != null && (
          <p className={cn('text-[12px]', m.estimate_margin_pct < m.target_pct ? 'text-[var(--warning)]' : 'text-[var(--success)]')}>
            {m.estimate_margin_pct >= m.target_pct
              ? `The estimate leaves ${m.estimate_margin_pct.toFixed(1)}% margin, which meets the ${m.target_pct}% target.`
              : `The estimate leaves ${m.estimate_margin_pct.toFixed(1)}% margin, below the ${m.target_pct}% target. Price would need to be ${money(t.total / (1 - m.target_pct / 100), currency)} to reach it.`}
          </p>
        )}
      </DetailSection>
      {e.spend_low && (
        <p className="text-[12px] text-[var(--warning)]">Projected margin is not shown: the work done is worth {money(e.ev, currency)} but only {money(e.ac, currency)} is booked as spent. Book the spend, or check the milestones marked done.</p>
      )}
      {tab === 'milestones' && (
        <p className={cn('text-[12px]', Math.abs(e.weight_total - 100) < 0.01 ? 'text-[var(--shell-text-muted)]' : 'text-[var(--warning)]')}>Weights add up to {e.weight_total}%{Math.abs(e.weight_total - 100) < 0.01 ? '.' : ', and earned value is only exact at 100%.'}</p>
      )}
      {tab === 'evm' && e.tcpi != null && <p className="text-[12px] text-[var(--shell-text)]">To finish within budget the remaining work has to be done at a cost efficiency of {e.tcpi.toFixed(2)}.</p>}
      {tab === 'evm' && data.milestones.length === 0 && <p className="text-[12px] text-[var(--warning)]">Add milestones so progress can be measured.</p>}
    </div>
  );

  const jc = job?.cost;
  const driftCount = (job?.lines ?? []).filter((l) => l.sub_drift !== 0).length;
  const jobSummary = !data || !job ? null : (
    <div className="space-y-4">
      <DetailSummary title={data.project.name} subtitle="Job BOM" status="Open to change" statusClass="text-[var(--shell-text-muted)]"
        figure={money(jc?.total ?? 0, currency)} figureLabel="Job build cost" />
      <DetailSection title="Cost of the job">
        <DetailGrid>
          <DetailField label="Parts" value={money(jc?.material, currency)} />
          <DetailField label="Scrap" value={money(jc?.scrap, currency)} />
          <DetailField label={`Freight${job.bom ? ` (${job.bom.freight_pct}%)` : ''}`} value={money(jc?.freight, currency)} />
          <DetailField label="Outsourced work" value={money(jc?.outsourced, currency)} />
          <DetailField label="In-house build operations" value={money(jc ? jc.conversion - jc.outsourced : 0, currency)} />
          {!!jc?.fixed && <DetailField label="Fixed costs" value={money(jc.fixed, currency)} />}
          <DetailField label={jc ? `Overhead (${money(jc.overhead_rate, currency)}/h)` : 'Overhead'} value={money(jc?.overhead, currency)} />
        </DetailGrid>
      </DetailSection>
      <DetailSection title="Against spend">
        <DetailGrid>
          <DetailField label="Job build cost" value={money(jc?.total ?? 0, currency)} />
          <DetailField label="Spent on the project" value={money(e?.ac, currency)} />
        </DetailGrid>
        <p className="text-[12px] text-[var(--shell-text-muted)]">The job cost sits in the Estimate as two lines from this BOM. Contingency and warranty are added by the estimate, not here.</p>
      </DetailSection>
      {driftCount > 0 && <p className="text-[12px] text-[var(--warning)]">{driftCount} sub-assembl{driftCount === 1 ? 'y has' : 'ies have'} a newer approved standard. The job keeps the cost it was priced at until you update the line.</p>}
    </div>
  );

  const detail = (() => {
    if (!selected) return null;
    if (tab === 'jobbom') {
      const l = selected as BomLineRow;
      return (
        <div className="space-y-4">
          <DetailSummary title={l.name} subtitle={l.part_no} figure={money(l.amount, currency)} figureLabel="Line cost" />
          <DetailSection title="Line">
            <DetailGrid>
              <DetailField label="Source" value={l.sub_product_id ? 'Standard product' : l.sourcing === 'MAKE' ? 'Make' : 'Buy'} />
              <DetailField label="Quantity" value={l.quantity} />
              <DetailField label="Scrap" value={`${l.scrap_pct}%`} />
              <DetailField label={l.sub_product_id ? 'Standard when costed' : 'Unit cost'} value={money(l.unit_cost, currency)} />
            </DetailGrid>
          </DetailSection>
          {l.sub_drift !== 0 && <p className="text-[12px] text-[var(--warning)]">The approved standard has since moved {l.sub_drift > 0 ? 'up' : 'down'} by {money(Math.abs(l.sub_drift), currency)} a unit. This job keeps the cost it was priced at. Use Update to current standard to reprice it.</p>}
        </div>
      );
    }
    if (tab === 'jobsteps') {
      const s = selected as OperationRow;
      const ohRate = job?.cost?.overhead_rate ?? 0;
      const oh = (s.is_outsourced || s.is_fixed) ? 0 : s.hours * ohRate;
      return (
        <div className="space-y-4">
          <DetailSummary title={s.type_name} subtitle={s.is_fixed ? 'Fixed cost' : s.is_outsourced ? 'Outsourced' : 'In house'} figure={money(s.amount + oh, currency)} figureLabel="Operation cost" />
          <DetailSection title="Operation">
            <DetailGrid>
              {s.is_fixed ? <DetailField label="Fixed cost per unit" value={money(s.fixed_cost, currency)} wide /> : s.is_outsourced ? <DetailField label="Outsourced cost" value={money(s.outsourced_cost, currency)} wide /> : (
                <>
                  <DetailField label="Role" value={s.role} wide />
                  <DetailField label="Cost per hour" value={money(s.rate, currency)} />
                  <DetailField label="Hours" value={s.hours} />
                  <DetailField label="Labour (hours × cost per hour)" value={money(s.hours * s.rate, currency)} />
                  <DetailField label={`Overhead (${money(ohRate, currency)}/h)`} value={money(oh, currency)} />
                </>
              )}
            </DetailGrid>
          </DetailSection>
        </div>
      );
    }
    if (tab === 'estimate') {
      const l = selected as EstimateLineRow;
      return (
        <div className="space-y-4">
          <DetailSummary title={l.description} subtitle={l.phase} figure={money(l.amount, currency)} figureLabel="Line cost" />
          <DetailSection title="Line">
            <DetailGrid>
              <DetailField label="Quantity" value={`${l.quantity} ${l.unit}`} />
              <DetailField label="Rate" value={money(l.rate, currency)} />
              <DetailField label="Type" value={l.type_label} wide />
              <DetailField label="Basis" value={l.basis} wide />
            </DetailGrid>
          </DetailSection>
          {l.managed && <p className="text-[12px] text-[var(--shell-text-muted)]">This line comes from the job BOM. Change the job BOM instead.</p>}
        </div>
      );
    }
    if (tab === 'baselines') {
      const b = selected as BaselineRow;
      const label = b.status === 'APPROVED' ? 'Approved' : b.status === 'PROPOSED' ? 'Proposed' : b.status === 'REJECTED' ? 'Rejected' : 'Replaced';
      const tone = b.status === 'APPROVED' ? 'text-[var(--success)]' : b.status === 'PROPOSED' ? 'text-[var(--warning)]' : b.status === 'REJECTED' ? 'text-[var(--danger)]' : 'text-[var(--shell-text-muted)]';
      const diff = t ? t.total - b.total : 0;
      return (
        <div className="space-y-4">
          <DetailSummary title={`Baseline of ${formatDate(b.created_at)}`} subtitle={`${b.line_count} estimate lines`} status={label} statusClass={tone} figure={money(b.total, currency)} figureLabel="Baseline total" />
          <DetailSection title="Cost">
            <DetailGrid>
              <DetailField label="Direct cost" value={money(b.direct, currency)} />
              <DetailField label="Contingency" value={money(b.contingency, currency)} />
              <DetailField label="Warranty" value={money(b.warranty, currency)} />
              <DetailField label="Proposed by" value={b.proposed_by_name} />
              {b.approved_at && <DetailField label="Approved by" value={`${b.approved_by_name ?? ''}, ${formatDate(b.approved_at)}`} wide />}
              {b.rejected_at && <DetailField label="Rejected by" value={`${b.rejected_by_name ?? ''}, ${formatDate(b.rejected_at)}`} wide />}
              {b.reject_reason && <DetailField label="Reason" value={b.reject_reason} wide />}
            </DetailGrid>
          </DetailSection>
          {Math.abs(diff) > 0.005 && <p className="text-[12px] text-[var(--shell-text-muted)]">The estimate now is {money(Math.abs(diff), currency)} {diff > 0 ? 'above' : 'below'} this baseline.</p>}
        </div>
      );
    }
    const x = selected as Milestone;
    return (
      <div className="space-y-4">
        <DetailSummary title={x.name} subtitle="Milestone" status={x.done_date ? `Done ${formatDate(x.done_date)}` : late(x) ? 'Late' : 'Open'}
          statusClass={x.done_date ? 'text-[var(--success)]' : late(x) ? 'text-[var(--warning)]' : 'text-[var(--shell-text-muted)]'} figure={`${x.weight_pct}%`} figureLabel="Weight" />
        <DetailSection title="Dates">
          <DetailGrid>
            <DetailField label="Planned" value={formatDate(x.planned_date)} />
            <DetailField label="Done" value={x.done_date ? formatDate(x.done_date) : undefined} />
          </DetailGrid>
        </DetailSection>
      </div>
    );
  })();

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--shell-surface)]">
      <TabBar<Tab> value={tab} onChange={switchTab} tabs={tabs} />
      <div className="min-h-0 flex-1">
        <ModuleShell
          showPanel={!!selected}
          searchRow={<DataTableToolbar table={table} actions={<><ToolbarActions actions={alwaysActions} /><ToolbarActions actions={itemActions} /></>} />}
          intelligencePanel={
            <ModuleIntelligencePanel title={selected ? (tab === 'estimate' ? 'Estimate line' : tab === 'baselines' ? 'Baseline' : tab === 'jobbom' ? 'Part' : tab === 'jobsteps' ? 'Build operation' : 'Milestone') : (tab === 'jobbom' || tab === 'jobsteps') ? 'Job BOM' : 'Project costing'} onClose={() => setSelection({})} hasSelection={!!selected}
              idle={((tab === 'jobbom' || tab === 'jobsteps') ? jobSummary : summary) ?? undefined} footer={itemActions.length ? <DetailActions actions={itemActions} /> : undefined}>
              {detail}
            </ModuleIntelligencePanel>
          }
        >
          <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table} emptyMessage={EMPTY[tab]} />
        </ModuleShell>
      </div>

      <ProjectSettingsModal isOpen={setOpen} onClose={() => setSetOpen(false)} data={data} />
      <EstimateLineModal isOpen={lineOpen} onClose={() => setLineOpen(false)} data={data} editing={editLine} />
      <EstimatePhasesModal isOpen={phasesOpen} onClose={() => setPhasesOpen(false)} />
      <BomLineModal isOpen={partOpen} onClose={() => setPartOpen(false)} job={job} editing={editPart} />
      <BuildStepModal isOpen={stepOpen} onClose={() => setStepOpen(false)} job={job} editing={editStep} />
      <StepTypesModal isOpen={typesOpen} onClose={() => setTypesOpen(false)} types={job?.operation_types ?? []} />
      <BomSettingsModal isOpen={freightOpen} onClose={() => setFreightOpen(false)} url={`/budgets/projects/${id}/job-bom`} freight={job?.bom?.freight_pct ?? 2} />
      <ConfirmDialog open={!!delPart} destructive title="Remove part" message={`Remove ${delPart?.name} from the job BOM?`} confirmLabel="Remove" onCancel={() => setDelPart(null)}
        onConfirm={async () => { const l = delPart; setDelPart(null); if (l) { await act(() => api.delete(`/budgets/bom-lines/${l.id}`), 'Part removed.'); setSelection({}); } }} />
      <ConfirmDialog open={!!delStep} destructive title="Remove build operation" message={`Remove ${delStep?.type_name} from the job BOM?`} confirmLabel="Remove" onCancel={() => setDelStep(null)}
        onConfirm={async () => { const s = delStep; setDelStep(null); if (s) { await act(() => api.delete(`/budgets/operations/${s.id}`), 'Build operation removed.'); setSelection({}); } }} />
      <MilestoneModal isOpen={msOpen} onClose={() => setMsOpen(false)} projectId={id} editing={editMs} weightLeft={weightLeft} />
      <ConfirmDialog open={!!delLine} destructive title="Remove estimate line" message={`Remove "${delLine?.description}" from the estimate?`} confirmLabel="Remove" onCancel={() => setDelLine(null)}
        onConfirm={async () => { const l = delLine; setDelLine(null); if (l) { await act(() => api.delete(`/budgets/estimate-lines/${l.id}`), 'Line removed.'); setSelection({}); } }} />
      <ConfirmDialog open={!!delMs} destructive title="Remove milestone" message={`Remove "${delMs?.name}"?`} confirmLabel="Remove" onCancel={() => setDelMs(null)}
        onConfirm={async () => { const x = delMs; setDelMs(null); if (x) { await act(() => api.delete(`/budgets/milestones/${x.id}`), 'Milestone removed.'); setSelection({}); } }} />
      <ConfirmDialog open={baselineOpen} title="Propose baseline" confirmLabel="Propose"
        message={`Send the estimate at ${money(t?.total, currency)} for approval as the baseline. The estimate stays open to edit; the baseline is a copy. Once approved it becomes the reference for earned value, and if this year's plan is still a draft its budget lines are added from it.`}
        onCancel={() => setBaselineOpen(false)}
        onConfirm={async () => { setBaselineOpen(false); await act(() => api.post(`/budgets/projects/${id}/baseline`, {}), 'Baseline proposed. Approve it on the Baselines tab.'); }} />
      <ConfirmDialog open={!!apprBase} title="Approve baseline" confirmLabel="Approve"
        message={`Approve ${money(apprBase?.total, currency)} as the baseline. Earned value is measured against it from now on${baseline ? `, and it replaces the current baseline of ${money(baseline.total, currency)}` : ''}. If this year's plan is still a draft, budget lines are added from it.`}
        onCancel={() => setApprBase(null)}
        onConfirm={async () => { const b = apprBase; setApprBase(null); if (!b) return; try { const r: any = await api.post(`/budgets/baselines/${b.id}/approve`, {}); const d = r?.data; toast.success(d && (d.lines_added || d.lines_updated || d.lines_removed) ? `Baseline approved. Budget lines: ${d.lines_added} added, ${d.lines_updated} updated, ${d.lines_removed} removed.` : 'Baseline approved.'); invalidate('budgets'); } catch (err: any) { toast.error(err?.message || 'Could not approve.'); } }} />
      {e && <EvmModal isOpen={evmOpen} onClose={() => setEvmOpen(false)} evm={e} currency={currency} />}
      <RejectBaselineModal isOpen={!!rejBase} onClose={() => setRejBase(null)} baseline={rejBase} />
    </div>
  );
}
