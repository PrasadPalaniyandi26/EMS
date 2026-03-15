'use client';
import { useEffect, useState, useMemo } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useBudgets, useInvalidate } from '@/hooks/use-queries';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Send, Download } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { AddBudgetModal, ExportBudgetModal, SubmitBudgetModal, DeleteBudgetModal } from '@/components/budgets/budget-modals';
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { columns, OrgBudget } from "./columns";
import {
  getCoreRowModel, getFacetedRowModel, getFacetedUniqueValues,
  getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  SortingState, ColumnFiltersState, VisibilityState,
} from "@tanstack/react-table";
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
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<any>(null);

  const table = useReactTable({
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
    setActiveRow(selectedRows.length === 1 ? selectedRows[0].original : null);
  }, [selectedRows]);

  useEffect(() => {
    setHeader('Budget Management', 'Resource allocation and spend tracking');
  }, [setHeader]);

  const handleSave = async (form: any) => {
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
      const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message || 'Failed to save budget.';
      toast.error(msg);
    }
  };

  const openAdd = () => { setEditingRow(null); setIsAddOpen(true); };
  const openEdit = () => {
    if (selectedCount !== 1) { toast.error('Select exactly one budget to edit'); return; }
    setEditingRow(selectedRows[0].original);
    setIsAddOpen(true);
  };

  const confirmDelete = async () => {
    try {
      await Promise.all(selectedRows.map((r) => api.delete(`/budgets/${r.original.id}`)));
      toast.success('Budget(s) deleted.');
      invalidate('budgets');
      setIsDeleteOpen(false);
      setRowSelection({});
    } catch {
      toast.error('Failed to delete budget(s).');
    }
  };

  const facetedDepts = useMemo(() => {
    const depts = new Set(allBudgets.map((b: any) => b.department).filter(Boolean));
    return Array.from(depts).map((d) => ({ label: d as string, value: d as string }));
  }, [allBudgets]);

  return (
    <ModuleShell
      showPanel={!!activeRow}
      actionsRow={
        <>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-slate-50 transition-all" onClick={openAdd}>
              <Plus className="h-[16px] w-[16px] text-green-600" /> Add Budget
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-slate-50 transition-all disabled:opacity-40" onClick={openEdit} disabled={selectedCount !== 1}>
              <Pencil className="h-[16px] w-[16px] text-blue-600" /> Edit
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-slate-50 transition-all disabled:opacity-40" onClick={() => { if (selectedCount !== 1) { toast.error('Select exactly one budget to submit'); return; } setIsSubmitOpen(true); }} disabled={selectedCount !== 1}>
              <Send className="h-[16px] w-[16px] text-juniper" /> Allocation
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-slate-50 transition-all disabled:opacity-40" onClick={() => { if (selectedCount === 0) { toast.error('Select budgets to delete'); return; } setIsDeleteOpen(true); }} disabled={selectedCount === 0}>
              <Trash2 className="h-[16px] w-[16px] text-red-500" /> Delete {selectedCount > 0 ? `(${selectedCount})` : ''}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-mystic transition-all" onClick={() => setIsExportOpen(true)}>
              <Download className="h-[16px] w-[16px] text-juniper" /> Export
            </button>
          </div>
        </>
      }
      searchRow={
        <DataTableToolbar
          table={table}
          facetedFilters={[
            { columnId: 'department', title: 'Department', options: facetedDepts },
          ]}
        />
      }
      intelligencePanel={
        activeRow && (
          <ModuleIntelligencePanel title="Budget Details" onClose={() => setRowSelection({})}>
            <div className="flex-1 space-y-6">
              <div className="bg-white/40 backdrop-blur-[6px] border border-white/40 rounded-[12px] p-5 shadow-sm">
                <label className="text-[10px] font-bold text-juniper uppercase">Utilization</label>
                {(() => {
                  const pct = activeRow.amount > 0 ? Math.min(((activeRow.spent || 0) / Number(activeRow.amount)) * 100, 100) : 0;
                  return (
                    <div className="flex items-center gap-4 mt-3">
                      <div className="flex-1 h-3 bg-casper/30 rounded-full overflow-hidden">
                        <div className={`h-full ${pct > 90 ? 'bg-rose-500' : 'bg-juniper'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-bold text-charcoal">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })()}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/40 backdrop-blur-[6px] border border-white/40 rounded-[12px] shadow-sm">
                  <label className="text-[9px] font-bold text-casper uppercase block tracking-wider">Allocated</label>
                  <p className="text-[14px] font-bold text-[#121212] mt-1">{formatCurrency(Number(activeRow.amount), currency)}</p>
                </div>
                <div className="p-4 bg-white/40 backdrop-blur-[6px] border border-white/40 rounded-[12px] shadow-sm">
                  <label className="text-[9px] font-bold text-casper uppercase block tracking-wider">Department</label>
                  <p className="text-[12px] font-bold text-[#121212] mt-1">{activeRow.department || '—'}</p>
                </div>
              </div>
              {activeRow.details && (
                <div className="p-4 bg-white/40 backdrop-blur-[6px] border border-white/40 rounded-[12px] shadow-sm">
                  <label className="text-[9px] font-bold text-casper uppercase block tracking-wider mb-2">Details</label>
                  <p className="text-[11px] text-charcoal leading-relaxed">{activeRow.details}</p>
                </div>
              )}
            </div>
          </ModuleIntelligencePanel>
        )
      }
    >
      <DataTable columns={columns(currency)} data={allBudgets} tableInstance={table} />

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

      <ExportBudgetModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />

      <DeleteBudgetModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={confirmDelete}
        count={selectedCount}
      />
    </ModuleShell>
  );
}
