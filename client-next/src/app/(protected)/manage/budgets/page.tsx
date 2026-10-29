'use client';
import { useEffect, useState, useMemo } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useBudgets, useInvalidate } from '@/hooks/use-queries';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Send } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { AddBudgetModal, SubmitBudgetModal, DeleteBudgetModal } from '@/components/budgets/budget-modals';
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { columns, OrgBudget } from "./columns";
import {
  getCoreRowModel, getFacetedRowModel, getFacetedUniqueValues,
  getFilteredRowModel, getPaginationRowModel, getSortedRowModel,
  SortingState, ColumnFiltersState, VisibilityState,
} from "@tanstack/react-table";
import { useDataTable } from '@/hooks/use-data-table';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import api from '@/lib/api-client';

export default function BudgetsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  const invalidate = useInvalidate();

  const { data: rawBudgets, isLoading } = useBudgets();
  const allBudgets = useMemo(() => (Array.isArray(rawBudgets) ? rawBudgets as unknown as OrgBudget[] : []), [rawBudgets]);

  const [activeRow, setActiveRow] = useState<any>(null);
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const table = useDataTable({
    data: allBudgets,
    columns: columns(currency),
    state: { sorting, columnVisibility, rowSelection, columnFilters },
    enableRowSelection: true,
    enableMultiRowSelection: false,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedCount = selectedRows.length;

  useEffect(() => {
    const rows = table.getFilteredSelectedRowModel().rows;
    setActiveRow(rows.length === 1 ? rows[0].original : null);
  }, [rowSelection]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setHeader('Budget Management', 'Resource allocation and spend tracking');
  }, [setHeader]);

  const handleSave = async (form: any) => {
    if (saving) return;
    setSaving(true);
    try {
      if (editingRow) {
        await api.put(`/budgets/${editingRow.id}`, form);
        toast.success('Budget updated.');
      } else {
        await api.post('/budgets', form);
        toast.success('Budget created.');
      }
      invalidate('budgets');
      setIsAddOpen(false);
      setEditingRow(null);
      setRowSelection({});
    } catch (err: any) {
      const msg = err?.message || 'Failed to save budget.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const openAdd = () => { setEditingRow(null); setIsAddOpen(true); };
  const openEdit = () => {
    if (selectedCount !== 1) { toast.error('Select exactly one budget to edit'); return; }
    setEditingRow(selectedRows[0].original);
    setIsAddOpen(true);
  };

  const confirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await Promise.all(selectedRows.map((r) => api.delete(`/budgets/${r.original.id}`)));
      toast.success('Budget(s) deleted.');
      invalidate('budgets');
      setIsDeleteOpen(false);
      setRowSelection({});
    } catch {
      toast.error('Failed to delete budget(s).');
    } finally {
      setDeleting(false);
    }
  };

  const facetedDepts = useMemo(() => {
    const depts = new Set(allBudgets.map((b: any) => b.department).filter(Boolean));
    return Array.from(depts).map((d) => ({ label: d as string, value: d as string }));
  }, [allBudgets]);

  return (
    <ModuleShell
      showPanel={!!activeRow}
      searchRow={
        <DataTableToolbar
          table={table}
          actions={
            <>
              <button className="btn-action" onClick={openAdd}>
                <Plus className="h-4 w-4 text-[var(--success)]" /> Add
              </button>
              <button className="btn-action" onClick={openEdit} disabled={selectedCount !== 1}>
                <Pencil className="h-4 w-4 text-[var(--info)]" /> Edit
              </button>
              <button className="btn-action" onClick={() => { if (selectedCount !== 1) { toast.error('Select exactly one budget to submit'); return; } setIsSubmitOpen(true); }} disabled={selectedCount !== 1}>
                <Send className="h-4 w-4 text-[var(--shell-accent)]" /> Allocation
              </button>
              <button className="btn-action" onClick={() => { if (selectedCount === 0) { toast.error('Select budgets to delete'); return; } setIsDeleteOpen(true); }} disabled={selectedCount === 0}>
                <Trash2 className="h-4 w-4 text-[var(--danger)]" /> Delete{selectedCount > 0 ? ` (${selectedCount})` : ''}
              </button>
            </>
          }
        />
      }
      intelligencePanel={
          <ModuleIntelligencePanel title="Budget Details" onClose={() => setRowSelection({})} hasSelection={!!activeRow}>
            {activeRow && (
            <div className="flex-1 space-y-3">
              <div className="bg-[var(--shell-hover)] rounded-xl border border-[var(--shell-border)] p-4">
                <label className="text-[11px] font-bold text-[var(--shell-text-muted)]">Utilization</label>
                {(() => {
                  const pct = activeRow.amount > 0 ? Math.min(((activeRow.spent || 0) / Number(activeRow.amount)) * 100, 100) : 0;
                  return (
                    <div className="flex items-center gap-4 mt-3">
                      <div className="flex-1 h-3 bg-[var(--shell-hover)] rounded-full overflow-hidden">
                        <div className={`h-full ${pct > 90 ? 'bg-[var(--danger)]' : 'bg-[var(--shell-accent)]'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-bold text-black dark:text-white">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })()}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-[var(--shell-hover)] rounded-xl border border-[var(--shell-border)]">
                  <label className="text-[11px] font-bold text-[var(--shell-text-muted)] block">Allocated</label>
                  <p className="text-[14px] font-bold text-black dark:text-white mt-1">{formatCurrency(Number(activeRow.amount), currency)}</p>
                </div>
                <div className="p-4 bg-[var(--shell-hover)] rounded-xl border border-[var(--shell-border)]">
                  <label className="text-[11px] font-bold text-[var(--shell-text-muted)] block">Department</label>
                  <p className="text-[12px] font-bold text-black dark:text-white mt-1">{activeRow.department || '—'}</p>
                </div>
              </div>
              {activeRow.details && (
                <div className="p-4 bg-[var(--shell-hover)] rounded-xl border border-[var(--shell-border)]">
                  <label className="text-[11px] font-bold text-[var(--shell-text-muted)] block mb-2">Details</label>
                  <p className="text-[11px] text-[var(--shell-text-muted)] leading-relaxed">{activeRow.details}</p>
                </div>
              )}
            </div>
            )}
          </ModuleIntelligencePanel>
      }
    >
      <DataTable columns={columns(currency)} data={allBudgets} tableInstance={table} emptyMessage="No budgets configured. Click Add to create one." />

      <AddBudgetModal
        isOpen={isAddOpen}
        onClose={() => { setIsAddOpen(false); setEditingRow(null); }}
        onSave={handleSave}
        editingData={editingRow}
      />

      <SubmitBudgetModal
        isOpen={isSubmitOpen}
        onClose={() => setIsSubmitOpen(false)}
        onSubmit={() => { invalidate('budgets'); setIsSubmitOpen(false); setRowSelection({}); }}
      />


      <DeleteBudgetModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={confirmDelete}
        count={selectedCount}
      />
    </ModuleShell>
  );
}
