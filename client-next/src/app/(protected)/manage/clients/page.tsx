'use client';
import { useEffect, useState } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useClients, useClientSectors, useInvalidate } from '@/hooks/use-queries';
import { useAuthStore } from '@/stores/auth-store';
import { ManageSectorsDialog } from '@/components/manage/manage-sectors-dialog';
import api from '@/lib/api-client';
import { toast } from 'sonner';
import { Pencil, Trash2, Plus, MapPin, Phone, Mail, Layers } from 'lucide-react';
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
  type SortingState,
} from "@tanstack/react-table";
import { useDataTable } from '@/hooks/use-data-table';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailAllocation, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { useConfirm } from '@/components/shared/modal-primitives';

const COUNTRIES = ['United Kingdom', 'United States', 'India', 'Germany', 'Canada', 'Singapore', 'Australia'];

export default function ClientsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const { data: clients, isLoading } = useClients();
  const { data: sectors } = useClientSectors();
  const invalidate = useInvalidate();
  // Managing sectors is admin-only; the API checks the active role the same way
  const isAdmin = (useAuthStore((s) => s.user)?.role_name || '').toUpperCase() === 'ADMIN';
  const [sectorsOpen, setSectorsOpen] = useState(false);
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm();

  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [activitySummary, setActivitySummary] = useState<{ projects: number; products: number } | null>(null);
  const [activityFailed, setActivityFailed] = useState(false);
  
  useEffect(() => { setHeader('Clients', 'Customers you work for and charge spend to'); }, [setHeader]);

  // Active clients first, then by name
  const [sorting, setSorting] = useState<SortingState>([{ id: 'is_active', desc: true }, { id: 'name', desc: false }]);
  const table = useDataTable<Client>({
    data: clients || [],
    columns,
    state: {
      rowSelection,
      globalFilter,
      sorting,
    },
    onSortingChange: setSorting,
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
    setActivityFailed(false);
    if (!selectedClient) { setActivitySummary(null); return; }
    setActivitySummary(null);
    (async () => {
      try {
        const [projects, products] = await Promise.all([
          api.get(`/projects?clientId=${selectedClient.id}`),
          api.get(`/products?clientId=${selectedClient.id}`),
        ]);
        const pData = (projects as { data: unknown }).data;
        const prData = (products as { data: unknown }).data;
        setActivitySummary({
          projects: Array.isArray(pData) ? pData.length : 0,
          products: Array.isArray(prData) ? prData.length : 0,
        });
      } catch { setActivitySummary(null); setActivityFailed(true); }
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
    } catch (e: any) { toast.error(e?.message || 'Could not save the client.'); }
  };

  const handleDelete = async () => {
    if (!selectedClient) return;
    const ok = await confirmDialog('Delete client', `Delete ${selectedClient.name}? Projects and products linked to it lose their client. This cannot be undone.`, { confirmLabel: 'Delete client', destructive: true });
    if (!ok) return;
    try {
      await api.delete(`/clients/${selectedClient.id}`);
      toast.success('Client deleted');
      invalidate('clients');
      setRowSelection({});
    } catch (e: any) { toast.error(e?.message || 'Could not delete the client.'); }
  };

  // The built-in Internal client cannot be changed, so it offers no actions
  const itemActions: DetailActionDef[] = selectedClient && !selectedClient.is_system ? [
    { label: 'Edit', variant: 'primary', onClick: openEdit },
    { label: 'Delete', variant: 'danger', onClick: handleDelete },
  ] : [];

  // What the list holds, instead of instructions
  const real = (clients || []).filter((c) => !c.is_system);
  const isOn = (c: any) => c.is_active === 1 || c.is_active === true;
  const clientSummary = (
    <div className="space-y-4">
      <DetailSummary title="All clients" subtitle="Customers you work for" figure={real.length} figureLabel="Clients" />
      <DetailSection title="Where they stand">
        <DetailGrid>
          <DetailField label="Active" value={real.filter(isOn).length} />
          <DetailField label="Inactive" value={real.filter((c) => !isOn(c)).length} />
          <DetailField label="Industries" value={new Set(real.map((c: any) => c.business_type).filter(Boolean)).size} />
          <DetailField label="Without a contact" value={real.filter((c: any) => !c.contact_name).length} tone={real.some((c: any) => !c.contact_name) ? 'warning' : 'muted'} />
        </DetailGrid>
      </DetailSection>
    </div>
  );

  return (
    <ModuleShell
      showPanel={!!selectedClient}
      searchRow={
        <DataTableToolbar
          table={table}
          actions={<>
            <button className="btn-action" onClick={openAdd}>
              <Plus className="h-4 w-4 text-[var(--success)]" /> Add
            </button>
            {isAdmin && (
              <button className="btn-action" onClick={() => setSectorsOpen(true)}>
                <Layers aria-hidden className="h-4 w-4 text-[var(--nav-violet)]" /> Sectors
              </button>
            )}
          <ToolbarActions actions={itemActions} /></>}
        />
      }
      intelligencePanel={
          <ModuleIntelligencePanel
            title={selectedClient ? 'Client' : 'Summary'}
            onClose={() => setRowSelection({})}
            hasSelection={!!selectedClient}
            idle={clientSummary}
            footer={itemActions.length > 0 ? <DetailActions actions={itemActions} /> : undefined}
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
                      <DetailField label="Email" value={c.contact_email ? <a className="text-[var(--shell-accent)] hover:underline" href={`mailto:${c.contact_email}`}>{c.contact_email}</a> : undefined} wide />
                    </DetailGrid>
                  </DetailSection>
                  <DetailSection title="Billing">
                    <DetailGrid>
                      <DetailField label="Payment terms" value={c.payment_terms} />
                      <DetailField label="Tax ID" value={c.tax_id} />
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
                      </DetailGrid>
                    </DetailSection>
                  )}
                  {activityFailed && <p className="text-[12px] text-[var(--shell-text-muted)]">Projects and products could not be loaded.</p>}
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
        emptyMessage={globalFilter ? 'No clients match this search.' : 'No clients yet. Use Add to create the first one.'}
      />

      {confirmDialogEl}

      <ClientModal
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        editing={editing}
      />

      <ManageSectorsDialog isOpen={sectorsOpen} onClose={() => setSectorsOpen(false)} sectors={sectors || []} />
    </ModuleShell>
  );
}
