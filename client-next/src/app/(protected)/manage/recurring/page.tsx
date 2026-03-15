'use client';

import { useEffect, useState, useMemo } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useRecurring, useCategories, useInvalidate } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  Search,
  Plus,
  Pencil,
  Pause,
  Play,
  Trash2,
  Filter,
  Calendar,
  CreditCard,
  Building2,
  History,
  X,
  Repeat,
  PauseCircle,
  PlayCircle,
  Gavel,
  ShieldCheck,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Download
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/currency';
import type { RecurringTransaction } from '@/lib/types';
import { RecurringModal, PauseRecurringModal, ResumeRecurringModal, DeleteRecurringModal } from '@/components/recurring/recurring-modals';
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { columns } from "./columns";
import {
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
} from "@tanstack/react-table";
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';

export default function RecurringPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  const { data: recurring, isLoading } = useRecurring();
  const { data: categories } = useCategories();
  const invalidate = useInvalidate();

  const [activeRow, setActiveRow] = useState<RecurringTransaction | null>(null);

  // TanStack Table State
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringTransaction | null>(null);

  const [isPauseModalOpen, setIsPauseModalOpen] = useState(false);
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [modalTarget, setModalTarget] = useState<RecurringTransaction | null>(null);

  const [form, setForm] = useState({
    type: 'expense',
    description: '',
    amount: '',
    category_id: '',
    frequency: 'monthly',
    next_run: new Date().toISOString().split('T')[0],
    is_active: true,
    project_id: '',
    payment_method: '',
    schedule_on: '1st_of_month',
    auto_submit: true,
    notes: ''
  });

  useEffect(() => {
    setHeader('Recurring', 'Automated Subscription & Periodic Expense Management');
  }, [setHeader]);

  const table = useReactTable({
    data: recurring || [],
    columns: columns(currency),
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
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
    const target = selectedRows.length === 1 ? selectedRows[0].original : null;
    setActiveRow(target);
  }, [selectedRows]);

  const openAdd = () => {
    setEditing(null);
    setForm({
      type: 'expense',
      description: '',
      amount: '',
      category_id: '',
      frequency: 'monthly',
      next_run: new Date().toISOString().split('T')[0],
      is_active: true,
      project_id: '',
      payment_method: '',
      schedule_on: '1st_of_month',
      auto_submit: true,
      notes: ''
    });
    setIsModalOpen(true);
  };

  const openEdit = () => {
    if (selectedCount !== 1) {
      toast.error('Select exactly one record to edit');
      return;
    }
    const target = selectedRows[0].original;
    setEditing(target);
    setForm({
      type: 'expense',
      description: target.description || '',
      amount: String(target.amount),
      category_id: String(target.category_id || ''),
      frequency: target.frequency || 'monthly',
      next_run: (target.next_run || target.next_run_date || '').split('T')[0] || '',
      is_active: target.is_active !== 0,
      project_id: '',
      payment_method: 'corporate_ach',
      schedule_on: '1st_of_month',
      auto_submit: true,
      notes: ''
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.category_id) {
      toast.error('Please fill in required fields (Description, Amount, Category)');
      return;
    }
    try {
      const body = {
        description: form.description,
        amount: Number(form.amount),
        category_id: Number(form.category_id),
        frequency: form.frequency,
        next_run: form.next_run,
        is_active: form.is_active ? 1 : 0,
      };
      if (editing) {
        await api.put(`/recurring/${editing.id}`, body);
        toast.success('Schedule Updated successfully');
      } else {
        await api.post('/recurring', body);
        toast.success('Schedule Created successfully');
      }
      invalidate('recurring');
      setIsModalOpen(false);
      setRowSelection({});
    } catch {
      toast.error('Failed to save schedule');
    }
  };

  const handleDelete = () => {
    if (!selectedCount) {
      toast.error('Select records to delete');
      return;
    }
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    try {
      for (const row of selectedRows) await api.delete(`/recurring/${row.original.id}`);
      toast.success('Deleted successfully');
      invalidate('recurring');
      setRowSelection({});
      setIsDeleteOpen(false);
    } catch {
      toast.error('Failed to delete records');
    }
  };

  const handleToggleStatus = async (status: 'pause' | 'resume') => {
    if (selectedCount !== 1) {
      toast.error(`Select exactly one record to ${status}`);
      return;
    }
    
    const target = selectedRows[0].original;
    setModalTarget(target);
    if (status === 'pause') {
      setIsPauseModalOpen(true);
    } else {
      setIsResumeModalOpen(true);
    }
  };

  const onConfirmPause = async (reason: string, resumeDate: string | null) => {
    if (!modalTarget) return;
    try {
      await api.put(`/recurring/${modalTarget.id}`, {
        ...modalTarget,
        next_run: (modalTarget.next_run || modalTarget.next_run_date || '').split('T')[0],
        is_active: 0,
        pause_reason: reason,
        resume_date: resumeDate
      });
      toast.success('Schedule Paused successfully');
      invalidate('recurring');
      setIsPauseModalOpen(false);
      setRowSelection({});
    } catch {
      toast.error('Failed to pause schedule');
    }
  };

  const onConfirmResume = async (updatedData: any) => {
    if (!modalTarget) return;
    try {
      await api.put(`/recurring/${modalTarget.id}`, {
        ...modalTarget,
        next_run: updatedData.next_run,
        amount: Number(updatedData.amount),
        frequency: updatedData.frequency,
        is_active: 1,
        resume_reason: updatedData.reason
      });
      toast.success('Schedule Resumed successfully');
      invalidate('recurring');
      setIsResumeModalOpen(false);
      setRowSelection({});
    } catch {
      toast.error('Failed to resume schedule');
    }
  };

  const facetedCategories = useMemo(() => {
    return (categories || [])
      .map((c: any) => ({
        label: c.name,
        value: c.name,
      }));
  }, [categories]);

  return (
    <ModuleShell
      showPanel={!!activeRow}
      actionsRow={
        <>
          <div className="flex items-center gap-3">
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-slate-50 transition-all"
              onClick={openAdd}
            >
              <Plus className="h-[16px] w-[16px] text-green-600" /> Add Recurring
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-slate-50 transition-all disabled:opacity-40"
              onClick={openEdit}
              disabled={selectedCount !== 1}
            >
              <Pencil className="h-[16px] w-[16px] text-blue-600" /> Edit
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-slate-50 transition-all disabled:opacity-40"
              onClick={() => handleToggleStatus('pause')}
              disabled={selectedCount !== 1}
            >
              <PauseCircle className="h-[16px] w-[16px] text-yellow-500" /> Pause
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-slate-50 transition-all disabled:opacity-40"
              onClick={() => handleToggleStatus('resume')}
              disabled={selectedCount !== 1}
            >
              <PlayCircle className="h-[16px] w-[16px] text-cyan-500" /> Resume
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-slate-50 transition-all disabled:opacity-40"
              onClick={handleDelete}
              disabled={selectedCount === 0}
            >
              <Trash2 className="h-[16px] w-[16px] text-red-500" /> Delete {selectedCount > 0 ? `(${selectedCount})` : ''}
            </button>
          </div>

          <div className="flex items-center gap-2">
             {/* Contextual actions could go here */}
          </div>
        </>
      }
      searchRow={
        <DataTableToolbar 
          table={table} 
          facetedFilters={[
            {
              columnId: "status",
              title: "Status",
              options: [
                { label: "Active", value: "Active" },
                { label: "Paused", value: "Paused" },
              ],
            },
            {
              columnId: "category_name",
              title: "Category",
              options: facetedCategories,
            },
          ]}
        />
      }
      intelligencePanel={
        activeRow && (
          <ModuleIntelligencePanel
            title="Subscription Lifecycle"
            onClose={() => setRowSelection({})}
          >
            <div className="flex-1 space-y-8">
              <div className="bg-white/40 backdrop-blur-[6px] border border-white/40 rounded-[12px] p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-juniper uppercase">Timeline Progress</label>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${activeRow.is_active ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {activeRow.is_active ? 'Active' : 'Paused'}
                  </span>
                </div>
                
                <div className="relative pt-6 pb-2 px-2">
                  <div className="absolute top-8 left-0 w-full h-1 bg-mystic rounded-full"></div>
                  <div className="absolute top-8 left-0 w-[65%] h-1 bg-juniper rounded-full"></div>
                  <div className="flex justify-between relative">
                    <div className="flex flex-col items-center">
                      <div className="w-4 h-4 rounded-full bg-juniper border-4 border-white shadow-sm mb-2"></div>
                      <span className="text-[9px] font-bold text-charcoal">Started</span>
                      <span className="text-[8px] text-casper uppercase">Jan 2023</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="w-4 h-4 rounded-full bg-juniper border-4 border-white shadow-sm mb-2"></div>
                      <span className="text-[9px] font-bold text-charcoal">Mid-Term</span>
                      <span className="text-[8px] text-casper uppercase">Jun 2023</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="w-4 h-4 rounded-full bg-mystic border-4 border-white shadow-sm mb-2"></div>
                      <span className="text-[9px] font-bold text-charcoal">Renewal</span>
                      <span className="text-[8px] text-casper uppercase">Jan 2024</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-bold text-juniper uppercase border-b border-casper/10 pb-2 flex items-center gap-2">
                  <Gavel className="w-4 h-4" /> Renewal Terms
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/40 backdrop-blur-[6px] border border-white/40 rounded-[12px] p-3 shadow-sm">
                    <p className="text-[9px] font-bold text-casper uppercase">Notice Period</p>
                    <p className="text-[13px] font-bold text-[#121212]">30 Days</p>
                  </div>
                  <div className="bg-white/40 backdrop-blur-[6px] border border-white/40 rounded-[12px] p-3 shadow-sm">
                    <p className="text-[9px] font-bold text-casper uppercase">Auto-Renewal</p>
                    <p className="text-[13px] font-bold text-[#121212]">{activeRow.is_active ? 'Enabled' : 'Disabled'}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-bold text-juniper uppercase border-b border-casper/10 pb-2 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> Linked Account
                </label>
                <div className="flex items-center gap-4 bg-white/40 backdrop-blur-[6px] border border-white/40 rounded-[12px] p-4 shadow-sm">
                  <div className="w-10 h-10 rounded-lg bg-juniper text-white flex items-center justify-center shadow-lg">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-[#121212]">Corporate Card •• 9821</p>
                    <p className="text-[10px] text-juniper font-medium">Exp: 08/26 | Limit: $50,000</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-bold text-juniper uppercase border-b border-casper/10 pb-2 flex items-center gap-2">
                  <History className="w-4 h-4" /> Run History
                </label>
                <div className="rounded-[12px] overflow-hidden border border-white/40 bg-white/40 backdrop-blur-[6px] shadow-sm">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-white/20 text-juniper font-bold">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2 text-center">Status</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-casper/10">
                      <tr>
                        <td className="px-3 py-2 text-[#121212]">Nov 01, 2023</td>
                        <td className="px-3 py-2 text-center">
                          <span className="text-emerald-600 font-bold uppercase text-[9px] px-1.5 py-0.5 bg-emerald-50 rounded">Success</span>
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-[#121212]">{formatCurrency(activeRow.amount, currency)}</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-[#121212]">Oct 01, 2023</td>
                        <td className="px-3 py-2 text-center">
                          <span className="text-emerald-600 font-bold uppercase text-[9px] px-1.5 py-0.5 bg-emerald-50 rounded">Success</span>
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-[#121212]">{formatCurrency(activeRow.amount, currency)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-2 flex gap-3">
                <button className="flex-1 bg-juniper text-white py-3 rounded-xl text-[11px] font-bold uppercase tracking-widest hover:brightness-110 shadow-lg shadow-juniper/20 transition-all active:scale-95">
                  Download Full Report
                </button>
                <button className="px-4 bg-white/40 backdrop-blur-[6px] border border-white/40 text-juniper rounded-xl hover:bg-white/60 transition-colors shadow-sm">
                   <Download className="w-5 h-5" />
                </button>
              </div>
            </div>
          </ModuleIntelligencePanel>
        )
      }
    >
      <DataTable 
        columns={columns(currency)} 
        data={recurring || []} 
        tableInstance={table}
      />

      <RecurringModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        editing={editing}
        form={form}
        setForm={setForm}
        categories={categories || []}
      />

      <PauseRecurringModal
        isOpen={isPauseModalOpen}
        onClose={() => setIsPauseModalOpen(false)}
        onConfirm={onConfirmPause}
        targetName={modalTarget?.description || ''}
      />

      <ResumeRecurringModal
        isOpen={isResumeModalOpen}
        onClose={() => setIsResumeModalOpen(false)}
        onConfirm={onConfirmResume}
        target={modalTarget}
      />

      <DeleteRecurringModal 
        isOpen={isDeleteOpen} 
        onClose={() => setIsDeleteOpen(false)} 
        onConfirm={confirmDelete}
        count={selectedCount}
      />
    </ModuleShell>
  );
}
