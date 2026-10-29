'use client';
import { useEffect, useState } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useClients, useInvalidate } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { toast } from 'sonner';
import { Pencil, Trash2, Plus, MapPin, Phone, Mail } from 'lucide-react';
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
  getFacetedRowModel,
  getFacetedUniqueValues,
} from "@tanstack/react-table";
import { useDataTable } from '@/hooks/use-data-table';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { useConfirm } from '@/components/shared/modal-primitives';

const BUSINESS_TYPES = ['Retail', 'Manufacturing', 'Technology', 'Healthcare', 'Finance', 'Consulting', 'Education', 'Logistics', 'Media', 'Construction', 'Other'];
const COUNTRIES = ['United Kingdom', 'United States', 'India', 'Germany', 'Canada', 'Singapore', 'Australia'];

export default function ClientsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const { data: clients } = useClients();
  const invalidate = useInvalidate();
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm();

  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [activitySummary, setActivitySummary] = useState<{ projects: number; products: number; transactions: number; totalSpend: number } | null>(null);
  
  useEffect(() => { setHeader('Clients', 'Customer Relationship & Contract Management'); }, [setHeader]);

  const table = useDataTable<Client>({
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
    const rows = table.getSelectedRowModel().rows;
    const target = rows.length === 1 ? rows[0].original : null;
    setSelectedClient(target);
  }, [rowSelection]); // eslint-disable-line react-hooks/exhaustive-deps

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

        setActivitySummary({
          projects: Array.isArray(pData) ? pData.length : 0,
          products: Array.isArray(prData) ? prData.length : 0,
          transactions: txnArr.length,
          totalSpend,
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
    const ok = await confirmDialog('Delete Client', `Permanently delete ${ids.length} client record(s)? This cannot be undone.`, { confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try {
      for (const id of ids) await api.delete(`/clients/${id}`);
      toast.success('Client entity purged'); 
      invalidate('clients'); 
      setRowSelection({});
    } catch { toast.error('Purge failed'); }
  };

  return (
    <ModuleShell
      showPanel={!!selectedClient}
      searchRow={
        <DataTableToolbar
          table={table}
          actions={
            <>
              <button className="btn-action" onClick={openAdd}>
                <Plus className="h-4 w-4 text-[var(--success)]" /> Add
              </button>
              <button className="btn-action" disabled={selectedRows.length !== 1} onClick={openEdit}>
                <Pencil className="h-4 w-4 text-[var(--info)]" /> Edit
              </button>
              <button className="btn-action" disabled={selectedRows.length === 0} onClick={handleDelete}>
                <Trash2 className="h-4 w-4 text-[var(--danger)]" /> Delete
              </button>
            </>
          }
        />
      }
      intelligencePanel={
          <ModuleIntelligencePanel
            title="Client Details"
            onClose={() => setRowSelection({})}
            hasSelection={!!selectedClient}
          >
            {selectedClient && (
            <div className="space-y-2.5">
              {/* Avatar + Name */}
              <div className="flex items-center gap-4 pb-4 border-b border-[var(--shell-border)]">
                <div className="w-14 h-14 bg-[var(--shell-accent)] rounded-xl flex items-center justify-center text-lg font-bold text-[var(--shell-accent-fg)] shrink-0">
                  {selectedClient.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-base leading-tight text-black dark:text-white truncate">{selectedClient.name}</p>
                  {(selectedClient as any).description && (
                    <p className="text-[11px] text-[var(--shell-text-muted)] mt-0.5 truncate">{(selectedClient as any).description}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {(() => { const active = (selectedClient.is_active as any) === 1 || (selectedClient.is_active as any) === true; return <>
                      <span className={`w-2 h-2 rounded-full ${active ? 'bg-[var(--shell-accent)]' : 'bg-[var(--shell-hover)]'}`} />
                      <span className={`text-[11px] font-bold ${active ? 'text-[var(--info)]' : 'text-[var(--shell-text-muted)]'}`}>
                        {active ? 'Active' : 'Inactive'}
                      </span>
                    </>; })()}
                  </div>
                </div>
              </div>

              {/* Contact */}
              {(selectedClient.contact_name || selectedClient.contact_email || selectedClient.contact_phone) && (
                <div className="bg-[var(--shell-hover)] p-3 rounded-xl border border-[var(--shell-border)] space-y-2">
                  <p className="text-[11px] font-black text-[var(--shell-text-muted)] mb-2">Contact</p>
                  {selectedClient.contact_name && (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-[var(--shell-hover)] rounded flex items-center justify-center shrink-0">
                        <span className="text-[11px] font-bold text-[var(--shell-text-muted)]">N</span>
                      </div>
                      <span className="text-[11px] font-semibold text-[var(--shell-text-muted)]">{selectedClient.contact_name}</span>
                    </div>
                  )}
                  {selectedClient.contact_email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-[var(--shell-text-muted)] shrink-0" />
                      <span className="text-[11px] text-[var(--shell-text-muted)] truncate">{selectedClient.contact_email}</span>
                    </div>
                  )}
                  {selectedClient.contact_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-[var(--shell-text-muted)] shrink-0" />
                      <span className="text-[11px] text-[var(--shell-text-muted)]">{selectedClient.contact_phone}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Address */}
              {((selectedClient as any).country || selectedClient.address) && (
                <div className="bg-[var(--shell-hover)] p-3 rounded-xl border border-[var(--shell-border)] space-y-2">
                  <p className="text-[11px] font-black text-[var(--shell-text-muted)] mb-2">Location</p>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-[var(--shell-text-muted)] shrink-0 mt-0.5" />
                    <div className="text-[11px] text-[var(--shell-text-muted)] space-y-0.5">
                      {selectedClient.address && <p>{selectedClient.address}</p>}
                      {(selectedClient as any).country && (
                        <p className="font-semibold text-[var(--shell-text-muted)]">{(selectedClient as any).country}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Activity summary */}
              {activitySummary && (
                <div className="bg-[var(--shell-hover)] p-3 rounded-xl border border-[var(--shell-border)]">
                  <p className="text-[11px] font-black text-[var(--shell-text-muted)] mb-3">Activity</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-3">
                    {[
                      { label: 'Projects', value: activitySummary.projects },
                      { label: 'Products', value: activitySummary.products },
                      { label: 'Transactions', value: activitySummary.transactions },
                    ].map(({ label, value }) => (
                      <div key={label} className="text-center">
                        <p className="text-base font-bold text-black dark:text-white">{value}</p>
                        <p className="text-[11px] text-[var(--shell-text-muted)] font-bold">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            )}
          </ModuleIntelligencePanel>
      }
    >
      <DataTable
        columns={columns}
        data={clients || []}
        tableInstance={table}
        emptyMessage="No clients found. Click Add to create one."
      />

      {confirmDialogEl}

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
