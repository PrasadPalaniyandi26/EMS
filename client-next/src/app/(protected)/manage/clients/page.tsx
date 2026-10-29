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
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailAllocation, DetailActions } from '@/components/shared/detail/detail-kit';
import { useConfirm } from '@/components/shared/modal-primitives';

const BUSINESS_TYPES = ['Retail', 'Manufacturing', 'Technology', 'Healthcare', 'Finance', 'Consulting', 'Education', 'Logistics', 'Media', 'Construction', 'Other'];
const COUNTRIES = ['United Kingdom', 'United States', 'India', 'Germany', 'Canada', 'Singapore', 'Australia'];

export default function ClientsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const { data: clients, isLoading } = useClients();
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
            <button className="btn-action" onClick={openAdd}>
              <Plus className="h-4 w-4 text-[var(--success)]" /> Add
            </button>
          }
        />
      }
      intelligencePanel={
          <ModuleIntelligencePanel
            title="Client Details"
            onClose={() => setRowSelection({})}
            hasSelection={!!selectedClient}
            footer={
              <DetailActions actions={[
                { label: 'Edit', variant: 'primary', onClick: openEdit },
                { label: 'Delete', variant: 'danger', onClick: handleDelete },
              ]} />
            }
          >
            {selectedClient && (() => {
              const c: any = selectedClient;
              const active = c.is_active === 1 || c.is_active === true;
              return (
                <>
                  <DetailSummary
                    title={c.name}
                    subtitle={c.description || c.code}
                    status={active ? 'Active' : 'Inactive'}
                    statusClass={active ? 'text-[var(--success)]' : 'text-[var(--shell-text-muted)]'}
                  />
                  <DetailSection title="Contact">
                    <DetailGrid>
                      <DetailField label="Contact name" value={c.contact_name} />
                      <DetailField label="Phone" value={c.contact_phone} />
                      <DetailField label="Email" value={c.contact_email} wide />
                    </DetailGrid>
                  </DetailSection>
                  <DetailSection title="Location">
                    <DetailGrid>
                      <DetailField label="Address" value={c.address} wide />
                      <DetailField label="Country" value={c.country} />
                      <DetailField label="Industry" value={c.business_type} />
                    </DetailGrid>
                  </DetailSection>
                  {activitySummary && (
                    <DetailSection title="Activity">
                      <DetailGrid>
                        <DetailField label="Projects" value={activitySummary.projects} />
                        <DetailField label="Products" value={activitySummary.products} />
                        <DetailField label="Transactions" value={activitySummary.transactions} />
                      </DetailGrid>
                    </DetailSection>
                  )}
                </>
              );
            })()}
          </ModuleIntelligencePanel>
      }
    >
      <DataTable
        isLoading={isLoading}
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
