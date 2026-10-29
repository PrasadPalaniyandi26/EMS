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
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailAllocation, DetailActions } from '@/components/shared/detail/detail-kit';
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
            <button className="btn-action" onClick={openAdd}>
              <Plus className="h-4 w-4 text-[var(--success)]" /> Add
            </button>
          }
        />
      }
      intelligencePanel={
          <ModuleIntelligencePanel
            title="Budget Details"
            onClose={() => setRowSelection({})}
            hasSelection={!!activeRow}
            footer={
              <DetailActions actions={[
                { label: 'Edit', variant: 'primary', onClick: openEdit },
                { label: 'Allocation', onClick: () => setIsSubmitOpen(true) },
                { label: 'Delete', variant: 'danger', onClick: () => setIsDeleteOpen(true) },
              ]} />
            }
          >
            {activeRow && (() => {
              const b: any = activeRow;
              const spent = Number(b.spent || 0);
              const pct = Number(b.amount) > 0 ? Math.min((spent / Number(b.amount)) * 100, 100) : 0;
              return (
                <>
                  <DetailSummary
                    title={b.name}
                    subtitle={b.code}
                    status={b.is_active ? 'Active' : 'Inactive'}
                    statusClass={b.is_active ? 'text-[var(--success)]' : 'text-[var(--shell-text-muted)]'}
                    figure={formatCurrency(Number(b.amount), currency)}
                    figureLabel="Allocated"
                  />
                  <DetailSection title="Utilization">
                    <DetailAllocation items={[{ label: 'Spent', amount: formatCurrency(spent, currency), pct }]} />
                  </DetailSection>
                  <DetailSection title="Details">
                    <DetailGrid>
                      <DetailField label="Department" value={b.department} />
                      <DetailField label="Category" value={b.category_name || 'General'} />
                      <DetailField label="Financial year" value={b.financial_year} />
                      <DetailField label="Owner" value={b.owner_name} />
                      {b.details && <DetailField label="Notes" value={b.details} wide />}
                    </DetailGrid>
                  </DetailSection>
                </>
              );
            })()}
          </ModuleIntelligencePanel>
      }
    >
      <DataTable isLoading={isLoading} columns={columns(currency)} data={allBudgets} tableInstance={table} emptyMessage="No budgets configured. Click Add to create one." />

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
