'use client';
import { useEffect, useState } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useClients, useInvalidate } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { toast } from 'sonner';
import { Pencil, Trash2, PlusCircle, MapPin, Phone, Mail } from 'lucide-react';
import type { Client } from '@/lib/types';
import { ClientModal } from '@/components/manage/client-modals';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { columns } from './columns';
import { 
  getCoreRowModel, 
  getFilteredRowModel, 
  getPaginationRowModel, 
  getSortedRowModel, 
  useReactTable,
  getFacetedRowModel,
  getFacetedUniqueValues,
} from "@tanstack/react-table";
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';

const BUSINESS_TYPES = ['Retail', 'Manufacturing', 'Technology', 'Healthcare', 'Finance', 'Consulting', 'Education', 'Logistics', 'Media', 'Construction', 'Other'];
const COUNTRIES = ['United Kingdom', 'United States', 'India', 'Germany', 'Canada', 'Singapore', 'Australia'];

export default function ClientsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const { data: clients } = useClients();
  const invalidate = useInvalidate();
  
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [activitySummary, setActivitySummary] = useState<{ projects: number; products: number; transactions: number; totalSpend: number; outstanding: number } | null>(null);
  
  useEffect(() => { setHeader('Clients', 'Customer Relationship & Contract Management'); }, [setHeader]);

  const table = useReactTable<Client>({
    data: clients || [],
    columns,
    state: {
      rowSelection,
      globalFilter,
    },
    enableRowSelection: true,
    enableMultiRowSelection: false,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const selectedRows = table.getSelectedRowModel().rows;

  useEffect(() => {
    const target = selectedRows.length === 1 ? selectedRows[0].original : null;
    setSelectedClient(target);
  }, [selectedRows]);

  useEffect(() => {
    if (!selectedClient) { setActivitySummary(null); return; }
    (async () => {
      try {
        const [projects, products, transactions] = await Promise.all([
          api.get(`/projects?clientId=${selectedClient.id}`),
          api.get(`/products?clientId=${selectedClient.id}`),
          api.get(`/transactions?clientId=${selectedClient.id}&limit=100`),
        ]);
        const pData = (projects as { data: unknown }).data;
        const prData = (products as { data: unknown }).data;
        const tRaw = (transactions as { data: unknown }).data;
        const txnArr: Array<Record<string, unknown>> = Array.isArray(tRaw)
          ? tRaw
          : (tRaw as Record<string, unknown>)?.rows
            ? ((tRaw as Record<string, unknown>).rows as Array<Record<string, unknown>>)
            : [];
        
        const totalSpend = txnArr.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0);
        // Set to 0 for now as schema doesn't have aggregate outstanding yet
        const outstanding = 0;

        setActivitySummary({
          projects: Array.isArray(pData) ? pData.length : 0,
          products: Array.isArray(prData) ? prData.length : 0,
          transactions: txnArr.length,
          totalSpend,
          outstanding
        });
      } catch { setActivitySummary(null); }
    })();
  }, [selectedClient]);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = () => {
    if (selectedRows.length !== 1) return;
    const target = selectedRows[0].original;
    if (target.is_system) { toast.error('System clients cannot be edited'); return; }
    setEditing(target);
    setDialogOpen(true);
  };

  const handleSave = async (form: any) => {
    try {
      if (editing) { await api.put(`/clients/${editing.id}`, form); toast.success('Client updated'); }
      else { await api.post('/clients', form); toast.success('Client created'); }
      invalidate('clients'); setDialogOpen(false); setRowSelection({});
    } catch { toast.error('Failed to save client'); }
  };

  const handleDelete = async () => {
    const ids = selectedRows.map(r => r.original.id);
    if (ids.length === 0) return;
    if (!confirm(`Permanently purge ${ids.length} selective client entity?`)) return;
    try {
      for (const id of ids) await api.delete(`/clients/${id}`);
      toast.success('Client entity purged'); 
      invalidate('clients'); 
      setRowSelection({});
    } catch { toast.error('Purge failed'); }
  };

  const facetedFilters: never[] = [];

  return (
    <ModuleShell
      showPanel={!!selectedClient}
      actionsRow={
        <>
          <div className="flex items-center gap-3">
            <button 
              onClick={openAdd}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-casper rounded-md text-[11px] font-bold text-[#121212] uppercase tracking-wider hover:bg-slate-50 transition-colors shadow-sm"
            >
              <PlusCircle className="h-4 w-4 text-emerald-600" /> Add Client
            </button>
            <button 
              disabled={selectedRows.length !== 1}
              onClick={openEdit}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-casper rounded-md text-[11px] font-bold text-[#121212] uppercase tracking-wider hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-40"
            >
              <Pencil className="h-4 w-4 text-blue-500" /> Edit
            </button>
            <button 
              disabled={selectedRows.length === 0}
              onClick={handleDelete}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-casper rounded-md text-[11px] font-bold text-[#121212] uppercase tracking-wider hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4 text-rose-500" /> Delete
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {clients?.length || 0} Total Clients
            </span>
          </div>
        </>
      }
      searchRow={
        <DataTableToolbar 
          table={table} 
          facetedFilters={facetedFilters}
        />
      }
      intelligencePanel={
        selectedClient && (
          <ModuleIntelligencePanel
            title="Client Details"
            onClose={() => setRowSelection({})}
          >
            <div className="space-y-4">
              {/* Avatar + Name */}
              <div className="flex items-center gap-4 pb-4 border-b border-casper/20">
                <div className="w-14 h-14 bg-juniper rounded-xl flex items-center justify-center text-lg font-bold text-white shadow-md shrink-0">
                  {selectedClient.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-base leading-tight text-[#121212] truncate">{selectedClient.name}</p>
                  {(selectedClient as any).description && (
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{(selectedClient as any).description}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {(() => { const active = (selectedClient.is_active as any) === 1 || (selectedClient.is_active as any) === true; return <>
                      <span className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      <span className={`text-[10px] font-bold uppercase ${active ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {active ? 'Active' : 'Inactive'}
                      </span>
                    </>; })()}
                  </div>
                </div>
              </div>

              {/* Contact */}
              {(selectedClient.contact_name || selectedClient.contact_email || selectedClient.contact_phone) && (
                <div className="bg-white/50 p-4 rounded-lg border border-casper/30 shadow-sm space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-juniper mb-2">Contact</p>
                  {selectedClient.contact_name && (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-juniper/10 rounded flex items-center justify-center shrink-0">
                        <span className="text-[8px] font-bold text-juniper">N</span>
                      </div>
                      <span className="text-[11px] font-semibold text-[#121212]">{selectedClient.contact_name}</span>
                    </div>
                  )}
                  {selectedClient.contact_email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-juniper shrink-0" />
                      <span className="text-[11px] text-slate-500 truncate">{selectedClient.contact_email}</span>
                    </div>
                  )}
                  {selectedClient.contact_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-juniper shrink-0" />
                      <span className="text-[11px] text-slate-500">{selectedClient.contact_phone}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Address */}
              {((selectedClient as any).country || selectedClient.address) && (
                <div className="bg-white/50 p-4 rounded-lg border border-casper/30 shadow-sm space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-juniper mb-2">Location</p>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-juniper shrink-0 mt-0.5" />
                    <div className="text-[11px] text-slate-500 space-y-0.5">
                      {selectedClient.address && <p>{selectedClient.address}</p>}
                      {(selectedClient as any).country && (
                        <p className="font-semibold text-[#121212]">{(selectedClient as any).country}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Activity summary */}
              {activitySummary && (
                <div className="bg-white/50 p-4 rounded-lg border border-casper/30 shadow-sm">
                  <p className="text-[9px] font-black uppercase tracking-widest text-juniper mb-3">Activity</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Projects', value: activitySummary.projects },
                      { label: 'Products', value: activitySummary.products },
                      { label: 'Transactions', value: activitySummary.transactions },
                    ].map(({ label, value }) => (
                      <div key={label} className="text-center">
                        <p className="text-base font-bold text-[#121212]">{value}</p>
                        <p className="text-[9px] text-slate-400 uppercase font-bold">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ModuleIntelligencePanel>
        )
      }
    >
      <DataTable 
        columns={columns} 
        data={clients || []} 
        tableInstance={table} 
      />

      <ClientModal
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        editing={editing}
        businessTypes={BUSINESS_TYPES}
        countries={COUNTRIES}
      />
    </ModuleShell>
  );
}
