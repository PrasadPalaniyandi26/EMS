'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FolderOpen, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, type SortingState } from '@tanstack/react-table';
import api from '@/lib/api-client';
import { formatDate } from '@/lib/currency';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useClients, useProjects, useProjectTypes, useProjectCategories, useUsers, useInvalidate } from '@/hooks/use-queries';
import { useBudgetProjects, type ProjectRow } from '@/hooks/use-planning-queries';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { type FilterDef } from '@/components/data-table/filters';
import { ConfirmDialog } from '@/components/shared/modal-primitives';
import { ManageTypesDialog } from '@/components/manage/manage-types-dialog';
import { ProjectModal } from '@/components/manage/project-modals';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { BillingSection } from '@/components/invoicing/billing-section';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { marginTone, plain, TONE_CLASS } from '@/components/budgets/budget-ui';
import type { Project } from '@/lib/types';
import { columns as buildColumns, PROJECT_STATES, PROJECT_STATUS_TONE, projectState, spentPct, verdictOf } from './columns';
import { PageFrame } from '@/components/shared/module/page-frame';

export default function ProjectsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  // Managing types and categories is admin-only; the API checks the active role the same way
  const role = (user?.role_name || '').toUpperCase();
  const isAdmin = role === 'ADMIN';
  // The API lets managers and admins change projects; the other roles read them and open their costing
  const canManage = role === 'ADMIN' || role === 'MANAGER';
  const invalidate = useInvalidate();
  const router = useRouter();

  const { data: projects, isLoading } = useProjects();
  const { data: costRows } = useBudgetProjects();
  const { data: clients } = useClients();
  const { data: usersData } = useUsers();
  const allUsers = Array.isArray(usersData) ? usersData : [];
  const { data: types } = useProjectTypes();
  const { data: categories } = useProjectCategories();

  const costById = useMemo(() => new Map<number, ProjectRow>((costRows ?? []).map((r) => [r.id, r])), [costRows]);
  const columns = useMemo(() => buildColumns(currency, (id) => costById.get(id)), [currency, costById]);

  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [client, setClient] = useState('ALL'); const [state, setState] = useState('ALL'); const [hasProduct, setHasProduct] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const real = useMemo(() => ((projects || []) as any[]).filter((p) => !p.is_system), [projects]);
  useEffect(() => {
    setHeader('Projects', projects ? `${real.length} projects, ${real.filter((p) => (p.status || 'Active') === 'Active').length} active` : 'Client projects: who leads them, estimate, margin and spend');
  }, [setHeader, projects]); // eslint-disable-line react-hooks/exhaustive-deps

  const clientNames = useMemo(() => [...new Set(real.map((p) => p.client_name).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b)), [real]);
  const rows = useMemo(() => real.filter((p) =>
    (client === 'ALL' || p.client_name === client) &&
    (state === 'ALL' || projectState(p) === state) &&
    (hasProduct === 'ALL' || (hasProduct === 'YES') === ((costById.get(p.id)?.products.length ?? 0) > 0))), [real, client, state, hasProduct, costById]);
  const filterDefs: FilterDef[] = [
    { id: 'client', label: 'Client', value: client, onChange: setClient, options: [{ value: 'ALL', label: 'All clients' }, ...clientNames.map((c) => ({ value: c, label: c }))] },
    { id: 'state', label: 'Status', value: state, onChange: setState, options: [{ value: 'ALL', label: 'All statuses' }, ...PROJECT_STATES.map((s) => ({ value: s, label: s }))] },
    { id: 'product', label: 'Product', placeholder: 'Product', value: hasProduct, onChange: setHasProduct, options: [{ value: 'ALL', label: 'All' }, { value: 'YES', label: 'Has a product' }, { value: 'NO', label: 'No product' }] },
  ];

  // Overdue and on-hold first, then active ones by how their costing stands
  const [sorting, setSorting] = useState<SortingState>([{ id: 'status', desc: false }]);
  const table = useDataTable<Project>({
    data: rows as Project[], columns, state: { rowSelection: selection, globalFilter, sorting }, onSortingChange: setSorting, getRowId: (r) => String(r.id),
    enableRowSelection: true, enableMultiRowSelection: false, onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });

  // /business/projects?id=7 opens the list with that project selected (other pages link here)
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current || !real.length) return;
    const wanted = Number(new URLSearchParams(window.location.search).get('id'));
    if (!wanted) return;
    linked.current = true;
    if (real.some((r) => r.id === wanted)) { setClient('ALL'); setState('ALL'); setHasProduct('ALL'); setSelection({ [String(wanted)]: true }); }
  }, [real]);

  const selected = (rows.find((r) => String(r.id) === Object.keys(selection)[0]) ?? null) as any;
  const cost = selected ? costById.get(selected.id) : undefined;

  const handleSaveProject = async (form: any) => {
    try {
      if (editingProject) { await api.put(`/projects/${editingProject.id}`, form); toast.success('Project updated'); }
      else { await api.post('/projects', form); toast.success('Project added'); }
      invalidate('projects'); invalidate('budgets');
      setIsModalOpen(false); setSelection({});
    } catch (err: any) { toast.error(err?.message || 'Failed to save project'); }
  };
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/projects/${deleteId}`);
      toast.success('Project deleted');
      invalidate('projects'); invalidate('budgets');
      setDeleteId(null); setSelection({});
    } catch (e: any) { setDeleteId(null); toast.error(e?.message || 'Could not delete the project.'); }
  };

  // Nothing selected: Add (and Types for an admin). A selected project adds Open, Edit and Delete.
  const alwaysActions: DetailActionDef[] = [
    ...(canManage ? [{ label: 'Add', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setEditingProject(null); setIsModalOpen(true); } }] : []),
    ...(isAdmin ? [{ label: 'Types', icon: <Tags aria-hidden className="h-4 w-4 text-[var(--nav-violet)]" />, onClick: () => setManageOpen(true) }] : []),
  ];
  const itemActions: DetailActionDef[] = selected ? [
    { label: 'Open', variant: 'primary', icon: <FolderOpen className="h-4 w-4 text-[var(--nav-slate)]" />, onClick: () => router.push(`/business/projects/${selected.id}`) },
    ...(canManage ? [{ label: 'Edit', icon: <Pencil className="h-4 w-4 text-[var(--info)]" />, onClick: () => { setEditingProject(selected); setIsModalOpen(true); } }] : []),
    ...(canManage ? [{ label: 'Delete', variant: 'danger' as const, icon: <Trash2 className="h-4 w-4 text-[var(--danger)]" />, onClick: () => setDeleteId(selected.id) }] : []),
  ] : [];

  const count = (s: string) => real.filter((p) => projectState(p) === s).length;
  const costed = [...costById.values()].filter((c) => real.some((p) => p.id === c.id));
  const atRisk = costed.filter((c) => verdictOf(c, currency).label === 'At risk').length;
  const sum = (pick: (r: ProjectRow) => number | null) => costed.reduce((a, r) => a + (pick(r) ?? 0), 0);
  const summary = (
    <div className="space-y-4">
      <DetailSummary title="All projects" subtitle={`Spent ${plain(sum((r) => r.actual), currency)} of ${plain(sum((r) => r.estimate_total), currency)} estimated`} figure={real.length} figureLabel="Projects" />
      <DetailSection title="Where they stand">
        <DetailGrid>
          <DetailField label="Past end date" value={count('Overdue')} tone={count('Overdue') ? 'danger' : 'muted'} />
          <DetailField label="On hold" value={count('On-Hold')} tone={count('On-Hold') ? 'warning' : 'muted'} />
          <DetailField label="At risk" value={atRisk} tone={atRisk ? 'danger' : 'muted'} />
          <DetailField label="Active" value={count('Active')} />
          <DetailField label="Proposed" value={count('Proposed')} />
          <DetailField label="Completed or canceled" value={count('Completed') + count('Canceled')} />
        </DetailGrid>
      </DetailSection>
      <DetailSection title="Totals">
        <DetailGrid>
          <DetailField label="Estimate cost" value={plain(sum((r) => r.estimate_total), currency)} />
          <DetailField label="Spent" value={plain(sum((r) => r.actual), currency)} />
          <DetailField label="Contract value" value={plain(sum((r) => r.contract_value), currency)} wide />
        </DetailGrid>
      </DetailSection>
      <p className="text-[12px] text-[var(--shell-text-muted)]">At risk means the margin is below the minimum or the spend is over the estimate. Select a project, then Open it for its estimate, baseline, milestones and earned value.</p>
    </div>
  );

  const state_ = selected ? projectState(selected) : '';
  const sv = cost ? verdictOf(cost, currency) : null;
  const sp = cost ? spentPct(cost) : null;
  const baseline = (s: string | null) => (s === 'BASELINE' ? 'Approved' : s === 'PROPOSED' ? 'Proposed' : s ? 'Not proposed' : 'No estimate');
  const panel = !selected ? null : (
    <div className="space-y-4">
      <DetailSummary title={selected.name} subtitle={selected.code || 'Code pending'} status={state_}
        statusClass={{ success: 'text-[var(--success)]', warning: 'text-[var(--warning)]', info: 'text-[var(--info)]', danger: 'text-[var(--danger)]', muted: 'text-[var(--shell-text-muted)]' }[PROJECT_STATUS_TONE[state_] || 'muted']}
        figure={cost?.contract_value != null ? plain(cost.contract_value, currency) : undefined} figureLabel={cost?.contract_value != null ? 'Contract value' : undefined} />
      {sv && <p className={`text-[13px] ${sv.tone === 'danger' ? TONE_CLASS.danger : 'text-[var(--shell-text-muted)]'}`}>{sv.label}. {sv.reason}</p>}
      <DetailSection title="Details">
        <DetailGrid>
          <DetailField label="Type" value={selected.type_name} />
          <DetailField label="Category" value={selected.category_name} />
          <DetailField label="Project lead" value={selected.lead} />
          <DetailField label="Client" value={selected.client_name} />
          <DetailField label="Start date" value={formatDate(selected.start_date)} />
          <DetailField label="End date" value={formatDate(selected.end_date)} />
        </DetailGrid>
      </DetailSection>
      {cost && (
        <DetailSection title="Cost and margin">
          <DetailGrid>
            <DetailField label="Margin" value={cost.projected_margin_pct != null ? `${cost.projected_margin_pct.toFixed(1)}%` : undefined} tone={marginTone(cost.projected_margin_pct, cost.target_margin_pct, cost.min_margin_pct)} />
            <DetailField label="Target margin" value={cost.target_margin_pct != null ? `${cost.target_margin_pct}%` : 'Not set'} />
            <DetailField label="Minimum margin" value={cost.min_margin_pct != null ? `${cost.min_margin_pct}%` : 'Not set'} />
            <DetailField label="Estimate cost" value={cost.estimate_total != null ? plain(cost.estimate_total, currency) : undefined} />
            <DetailField label="Spent" value={plain(cost.actual, currency)} />
            <DetailField label="Spent of estimate" value={sp != null ? `${Math.round(sp)}%` : undefined} />
            <DetailField label="Baseline" value={baseline(cost.estimate_status)} />
            <DetailField label="Risk" value={cost.risk_rating ? cost.risk_rating.charAt(0) + cost.risk_rating.slice(1).toLowerCase() : undefined} />
          </DetailGrid>
        </DetailSection>
      )}
      <BillingSection kind="project" id={selected.id} />
      {cost && cost.products.length > 0 && (
        <DetailSection title={`Products (${cost.products.length})`}>
          <ul className="space-y-1">
            {cost.products.map((p) => <li key={p.id} className="truncate text-[13px] text-[var(--shell-text)]">{p.code ? `${p.code} ` : ''}{p.name}</li>)}
          </ul>
        </DetailSection>
      )}
      {selected.description && (
        <DetailSection title="Description">
          <p className="text-[13px] leading-relaxed text-[var(--shell-text)]">{selected.description}</p>
        </DetailSection>
      )}
    </div>
  );

  return (
    <PageFrame label="Projects">
    <ModuleShell
      showPanel={!!selected}
      searchRow={<DataTableToolbar table={table} filterDefs={filterDefs} actions={<><ToolbarActions actions={alwaysActions} /><ToolbarActions actions={itemActions} /></>} />}
      intelligencePanel={
        <ModuleIntelligencePanel title={selected ? 'Project' : 'Summary'} onClose={() => setSelection({})} hasSelection={!!selected}
          idle={summary} footer={itemActions.length > 0 ? <DetailActions actions={itemActions} /> : undefined}>
          {panel}
        </ModuleIntelligencePanel>
      }
    >
      <DataTable isLoading={isLoading} columns={columns} data={rows as Project[]} tableInstance={table}
        emptyMessage={globalFilter || client !== 'ALL' || state !== 'ALL' || hasProduct !== 'ALL' ? 'No projects match. Clear a filter or the search to see more.' : canManage ? 'No projects yet. Use Add to create the first one.' : 'No projects yet.'} />

      <ProjectModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveProject} categories={categories || []} editing={editingProject} clients={clients || []} projectTypes={types || []} users={allUsers} />
      <ManageTypesDialog kind="project" isOpen={manageOpen} onClose={() => setManageOpen(false)} types={types || []} categories={categories || []} />
      <ConfirmDialog open={!!deleteId} title="Delete project" message={`Delete ${(real.find((p) => p.id === deleteId)?.name) ?? 'this project'}? It is removed from every list. Expenses already charged to it are kept.`} confirmLabel="Delete project" destructive onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </ModuleShell>
    </PageFrame>
  );
}
