'use client';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useClients, useClientSectors, useInvalidate } from '@/hooks/use-queries';
import { useAuthStore } from '@/stores/auth-store';
import { ManageSectorsDialog } from '@/components/manage/manage-sectors-dialog';
import api from '@/lib/api-client';
import { toast } from 'sonner';
import { Pencil, Trash2, Plus, MapPin, Phone, Mail, Layers, FileText, ClipboardList } from 'lucide-react';
import type { Client } from '@/lib/types';
import { ClientModal } from '@/components/manage/client-modals';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { columns, owingColumns } from './columns';
import { TabBar, money, useTabParam } from '@/components/budgets/budget-ui';
import { useInvoiceSummary } from '@/hooks/use-invoicing';
import { canPropose } from '@/lib/permissions';
import { InvoiceModal, PoModal } from '@/components/invoicing/invoicing-modals';
import { InvoicesView, PurchaseOrdersView } from '@/components/invoicing/client-billing';
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
import { PageFrame } from '@/components/shared/module/page-frame';

type ClientTab = 'clients' | 'pos' | 'invoices';
const CLIENT_TABS = ['clients', 'pos', 'invoices'] as const;
const COUNTRIES = ['United Kingdom', 'United States', 'India', 'Germany', 'Canada', 'Singapore', 'Australia'];

export default function ClientsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const { data: clients, isLoading } = useClients(true);
  const { data: sectors } = useClientSectors();
  const invalidate = useInvalidate();
  // Managing sectors is admin-only; the API checks the active role the same way
  const role = (useAuthStore((s) => s.user)?.role_name || '').toUpperCase();
  const isAdmin = role === 'ADMIN';
  // The API lets managers and admins change clients; the other roles only read them
  const canManage = role === 'ADMIN' || role === 'MANAGER';
  // Purchase orders and invoices: Admin, Finance, Manager and Operations read them; Operations, Finance and Admin add POs and draft invoices
  const canBill = ['ADMIN', 'FINANCE', 'MANAGER', 'OPERATIONS'].includes(role);
  const canWrite = canPropose(role);
  const [tab, setTab] = useTabParam<ClientTab>(CLIENT_TABS, 'clients');
  const [poOpen, setPoOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const { data: owingData } = useInvoiceSummary(canBill);
  const owing = useMemo(() => new Map((owingData?.rows ?? []).map((r) => [r.client_id, r])), [owingData]);
  const cols = useMemo(() => (canBill ? [...columns.slice(0, -1), ...owingColumns(owing), columns[columns.length - 1]] : columns), [canBill, owing]);
  const [sectorsOpen, setSectorsOpen] = useState(false);
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm();

  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [activitySummary, setActivitySummary] = useState<{ projects: number; products: number } | null>(null);
  const [activityFailed, setActivityFailed] = useState(false);
  
  useEffect(() => { setHeader(tab === 'pos' ? 'Purchase orders' : tab === 'invoices' ? 'Invoices' : 'Clients', tab === 'pos' ? 'What clients have ordered and what is left to invoice' : tab === 'invoices' ? 'Tax invoices to clients and what is still owed' : 'Customers you work for and charge spend to'); }, [setHeader, tab]);

  // Active clients first, then by name
  const [sorting, setSorting] = useState<SortingState>([{ id: 'is_active', desc: true }, { id: 'name', desc: false }]);
  const table = useDataTable<Client>({
    data: clients || [],
    columns: cols,
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


  // /manage/clients?id=7 opens the list with that client selected
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current || !clients?.length) return;
    const wanted = Number(new URLSearchParams(window.location.search).get('id'));
    if (!wanted) return;
    const at = clients.findIndex((r: any) => r.id === wanted);
    linked.current = true;
    if (at >= 0) setRowSelection({ [at]: true });
  }, [clients]);

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
    const ok = await confirmDialog('Delete client', `Delete ${selectedClient.name}? It is deactivated: no longer offered when you add a project, product or expense, and kept on everything it is already on. Edit turns it back on.`, { confirmLabel: 'Delete client', destructive: true });
    if (!ok) return;
    try {
      await api.delete(`/clients/${selectedClient.id}`);
      toast.success('Client deleted');
      invalidate('clients');
      setRowSelection({});
    } catch (e: any) { toast.error(e?.message || 'Could not delete the client.'); }
  };

  // The built-in Internal client cannot be changed, so it offers no actions
  const itemActions: DetailActionDef[] = canManage && selectedClient && !selectedClient.is_system ? [
    { label: 'Edit', variant: 'primary', onClick: openEdit },
    { label: 'Delete', variant: 'danger', onClick: handleDelete },
  ] : [];

  // Raise a PO or an invoice for the selected client
  const billable = canWrite && selectedClient && !selectedClient.is_system && (selectedClient.is_active === 1 || (selectedClient.is_active as unknown) === true);
  const billingActions: DetailActionDef[] = billable ? [
    { label: 'Add PO', icon: <ClipboardList className="h-4 w-4 text-[var(--nav-amber)]" />, onClick: () => setPoOpen(true) },
    { label: 'New invoice', icon: <FileText className="h-4 w-4 text-[var(--nav-cyan)]" />, onClick: () => setInvoiceOpen(true) },
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

  const clientsView = (
    <ModuleShell
      showPanel={!!selectedClient}
      searchRow={
        <DataTableToolbar
          table={table}
          actions={<ToolbarActions actions={[
            ...(canManage ? [{ label: 'Add', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: openAdd }] : []),
            ...(isAdmin ? [{ label: 'Sectors', icon: <Layers aria-hidden className="h-4 w-4 text-[var(--nav-violet)]" />, onClick: () => setSectorsOpen(true) }] : []),
            ...itemActions,
            ...billingActions,
          ]} />}
        />
      }
      intelligencePanel={
          <ModuleIntelligencePanel
            title={selectedClient ? 'Client' : 'Summary'}
            onClose={() => setRowSelection({})}
            hasSelection={!!selectedClient}
            idle={clientSummary}
            footer={itemActions.length + billingActions.length > 0 ? <DetailActions actions={[...itemActions, ...billingActions]} /> : undefined}
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
                  <DetailSection title="Location">
                    <DetailGrid>
                      <DetailField label="Address" value={c.address} wide />
                      <DetailField label="Country" value={c.country} />
                      <DetailField label="Industry" value={c.business_type} />
                    </DetailGrid>
                  </DetailSection>
                  {canBill && (() => {
                    const o = owing.get(c.id);
                    return (
                      <DetailSection title="Billing">
                        <DetailGrid>
                          <DetailField label="GSTIN" value={c.gstin} />
                          <DetailField label="Payment terms" value={c.payment_terms_days != null ? (c.payment_terms_days === 0 ? 'Due on receipt' : `${c.payment_terms_days} days`) : undefined} />
                          <DetailField label="Billed" value={o ? money(o.billed) : undefined} />
                          <DetailField label="Received" value={o ? money(o.received) : undefined} />
                          <DetailField label="Outstanding" value={o ? money(o.outstanding) : undefined} />
                          <DetailField label="Overdue" value={o && o.overdue > 0 ? money(o.overdue) : undefined} tone="danger" />
                          <DetailField label="Open POs" value={o?.open_pos} wide />
                        </DetailGrid>
                        {!c.gstin && !c.state && <p className="text-[12px] text-[var(--warning)]">Add the GSTIN or the state, so tax invoices can be issued.</p>}
                      </DetailSection>
                    );
                  })()}
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
        columns={cols}
        data={clients || []}
        tableInstance={table}
        emptyMessage={globalFilter ? 'No clients match this search.' : canManage ? 'No clients yet. Use Add to create the first one.' : 'No clients yet.'}
      />

      {confirmDialogEl}

      <ClientModal
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        editing={editing}
      />

      <ManageSectorsDialog isOpen={sectorsOpen} onClose={() => setSectorsOpen(false)} sectors={sectors || []} />
      <PoModal isOpen={poOpen} onClose={() => setPoOpen(false)} editing={null} clientId={selectedClient?.id ?? null} />
      <InvoiceModal isOpen={invoiceOpen} onClose={() => setInvoiceOpen(false)} editing={null} clientId={selectedClient?.id ?? null} />
    </ModuleShell>
  );

  if (!canBill) return <PageFrame label="Clients">{clientsView}</PageFrame>;
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--shell-surface)]">
      <TabBar<ClientTab> value={tab} onChange={setTab} tabs={[{ value: 'clients', label: 'Clients' }, { value: 'pos', label: 'Purchase orders' }, { value: 'invoices', label: 'Invoices' }]} />
      <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1">
        {tab === 'clients' ? clientsView : tab === 'pos' ? <PurchaseOrdersView /> : <InvoicesView />}
      </div>
    </div>
  );
}
