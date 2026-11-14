'use client';

import { useEffect, useState, useMemo } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useUsers, useRoles, useDepartments, useInvalidate } from '@/hooks/use-queries';
import { ManageDepartmentsDialog } from '@/components/manage/manage-departments-dialog';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { toast } from 'sonner';
import {
  Plus,
  Pencil,
  Shield,
  UserX,
  User as UserIcon,
  Briefcase,
  Calendar,
  FolderOpen,
  Mail,
  Building2,
  ShieldCheck,
  Phone,
  UserCheck,
} from 'lucide-react';
import type { User } from '@/lib/types';
import { 
  getCoreRowModel, 
  getFilteredRowModel, 
  getPaginationRowModel, 
  getSortedRowModel, 
  getFacetedUniqueValues,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
  RowSelectionState
} from "@tanstack/react-table";
import { useDataTable } from '@/hooks/use-data-table';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { columns, userStatus } from './columns';
import { UserModal } from '@/components/manage/user-modal';
import { AllocationModal } from '@/components/manage/allocation-modal';
import { PermissionsModal } from '@/components/manage/permissions-modal';
import { cn } from '@/lib/utils';
import { parseApiDate } from '@/lib/currency';
import { useConfirm } from '@/components/shared/modal-primitives';
import { TabBar, useTabParam } from '@/components/budgets/budget-ui';
import { useCompanyProfile } from '@/hooks/use-invoicing';
import { CompanyForm } from '@/components/invoicing/invoicing-modals';
import { isFinanceRole } from '@/lib/permissions';

type OrgTab = 'people' | 'company';
const ORG_TABS = ['people', 'company'] as const;

export default function OrganizationPage() {
  const [orgTab, setOrgTab] = useTabParam<OrgTab>(ORG_TABS, 'people');
  const orgRole = useAuthStore((st) => st.user?.role_name);
  // The company details are on every invoice: Admin, Finance, Manager and Operations see them, Admin and Finance change them
  const canSeeCompany = ['ADMIN', 'FINANCE', 'MANAGER', 'OPERATIONS'].includes((orgRole || '').toUpperCase());
  const { data: company } = useCompanyProfile(canSeeCompany);
  const setHeader = useHeaderStore((s) => s.setHeader);
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = (currentUser?.role_name || '').toLowerCase() === 'admin';
  const { data: usersData, isLoading } = useUsers();
  const { data: roles } = useRoles();
  const { data: managersData } = useQuery({
    queryKey: ['managers'],
    queryFn: () => api.get<any[]>('/users/by-role/managers').then((r) => r.data),
    staleTime: 2 * 60 * 1000,
  });
  const invalidate = useInvalidate();
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm();
  const users: User[] = Array.isArray(usersData) ? usersData : [];
  const managersList: any[] = Array.isArray(managersData) ? managersData : [];

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [departmentsOpen, setDepartmentsOpen] = useState(false);
  const { data: departments } = useDepartments();
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);
  const [panelAllocations, setPanelAllocations] = useState<any[]>([]);

  const activeCount = users.filter((u) => userStatus(u) === 'ACTIVE').length;
  useEffect(() => {
    setHeader('Organization', users.length ? `${activeCount} of ${users.length} people active` : 'Your team, their roles and managers');
  }, [setHeader, users.length, activeCount]);

  const selectedUser = useMemo(() => {
    return users.find(u => u.id === selectedId);
  }, [users, selectedId]);

  const userColumns = useMemo(() => columns(users), [users]);

  // People who are on hold or inactive first, then by name
  const [sorting, setSorting] = useState<SortingState>([{ id: 'status', desc: false }, { id: 'username', desc: false }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useDataTable({
    data: users,
    columns: userColumns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    enableRowSelection: true,
    enableMultiRowSelection: false,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  useEffect(() => {
    const sr = table.getFilteredSelectedRowModel().rows;
    const target = sr.length === 1 ? sr[0].original.id : null;
    setSelectedId(target);
    if (target) {
      api.get(`/users/${target}/allocations`).then((res) => setPanelAllocations(res.data as any[])).catch(() => setPanelAllocations([]));
    } else {
      setPanelAllocations([]);
    }
  }, [rowSelection]);

  const handleSaveUser = async (formData: any) => {
    try {
      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, formData);
        toast.success('User updated successfully');
      } else {
        const res = await api.post('/users', formData);
        const newId = (res.data as any).id;
        if (newId) await api.put(`/users/${newId}/permissions`, {});
        toast.success('User created successfully');
      }
      invalidate('users');
      setUserModalOpen(false);
      setEditingUser(null);
    } catch (e: any) {
      toast.error(e?.message || 'Could not save the user.');
    }
  };

  const isAdminUser = (u: any) => (u.roles || []).some((r: any) => String(r.role_name).toUpperCase() === 'ADMIN') || String(u.role_name).toUpperCase() === 'ADMIN';
  const onlyActiveAdmin = (u: any) => isAdminUser(u) && users.filter((x) => isAdminUser(x) && userStatus(x) === 'ACTIVE').length <= 1;

  const handleDeactivate = async () => {
    if (!selectedUser) return;
    const name = selectedUser.username;
    const ok = await confirmDialog('Deactivate user', `Deactivate ${name} (NT${10000 + selectedUser.id})? They lose access immediately. Their pending approvals stay with them until reassigned.`, { confirmLabel: 'Deactivate user', destructive: true });
    if (!ok) return;
    try {
      await api.put(`/users/${selectedUser.id}`, { isActive: false, user_status: 'INACTIVE' });
      toast.success(`${name} deactivated`);
      invalidate('users');
      setSelectedId(null);
    } catch (e: any) {
      toast.error(e?.message || 'Could not deactivate the user.');
    }
  };

  const handleReactivate = async () => {
    if (!selectedUser) return;
    try {
      await api.put(`/users/${selectedUser.id}`, { isActive: true, user_status: 'ACTIVE' });
      toast.success(`${selectedUser.username} is active again`);
      invalidate('users');
    } catch (e: any) {
      toast.error(e?.message || 'Could not reactivate the user.');
    }
  };

  const managerName = (id?: number) => users.find(u => u.id === id)?.username || '—';

  // You cannot deactivate yourself or the only active admin; someone who is on hold or inactive can be brought back
  const st = selectedUser ? userStatus(selectedUser) : 'ACTIVE';
  const canDeactivate = !!selectedUser && st !== 'INACTIVE' && selectedUser.id !== currentUser?.id && !onlyActiveAdmin(selectedUser);
  const itemActions: DetailActionDef[] = isAdmin && selectedUser ? [
    ...(st !== 'ACTIVE' ? [{ label: 'Reactivate', variant: 'primary' as const, icon: <UserCheck className="h-4 w-4 text-[var(--success)]" />, onClick: handleReactivate }] : []),
    { label: 'Edit', variant: st === 'ACTIVE' ? 'primary' as const : undefined, onClick: () => { setEditingUser(selectedUser); setUserModalOpen(true); } },
    { label: 'Permissions', onClick: () => setPermissionsModalOpen(true) },
    ...(canDeactivate ? [{ label: 'Deactivate', variant: 'danger' as const, onClick: handleDeactivate }] : []),
  ].slice(0, 3) : [];

  // Who is on the team and what needs a look, instead of instructions
  const count = (s: string) => users.filter((u) => userStatus(u) === s).length;
  const roleCount = (r: string) => users.filter((u) => String(u.role_name).toUpperCase() === r).length;
  const noManager = users.filter((u) => String(u.role_name).toUpperCase() === 'EMPLOYEE' && !(u as any).manager_id && !(u as any).manager_name).length;
  const orgSummary = (
    <div className="space-y-4">
      <DetailSummary title="Team" subtitle="People with access" figure={users.length} figureLabel="People" />
      <DetailSection title="Needs a look">
        <DetailGrid>
          <DetailField label="On hold" value={count('ON_HOLD')} tone={count('ON_HOLD') ? 'warning' : 'muted'} />
          <DetailField label="Inactive" value={count('INACTIVE')} />
          <DetailField label="Employees without a manager" value={noManager} tone={noManager ? 'warning' : 'muted'} wide />
        </DetailGrid>
      </DetailSection>
      <DetailSection title="By role">
        <DetailGrid>
          <DetailField label="Admin" value={roleCount('ADMIN')} />
          <DetailField label="Finance" value={roleCount('FINANCE')} />
          <DetailField label="Manager" value={roleCount('MANAGER')} />
          <DetailField label="Employee" value={roleCount('EMPLOYEE')} />
          <DetailField label="Configurator" value={roleCount('CONFIGURATOR')} />
          <DetailField label="Operations" value={roleCount('OPERATIONS')} />
        </DetailGrid>
      </DetailSection>
    </div>
  );

  const peopleView = (
    <ModuleShell
      showPanel={!!selectedUser}
      searchRow={
        <DataTableToolbar
          table={table}
          actions={<>
            <button className="btn-action" onClick={() => { setEditingUser(null); setUserModalOpen(true); }} disabled={!isAdmin} title={!isAdmin ? 'Admin access required' : undefined}>
              <Plus className="h-4 w-4 text-[var(--success)]" /> Add
            </button>
            {isAdmin && (
              <button className="btn-action" onClick={() => setDepartmentsOpen(true)}>
                <Building2 aria-hidden className="h-4 w-4 text-[var(--nav-violet)]" /> Departments
              </button>
            )}
          <ToolbarActions actions={itemActions} /></>}
        />
      }
      intelligencePanel={
          <ModuleIntelligencePanel
            title={selectedUser ? 'Person' : 'Summary'}
            icon={<UserIcon className="h-3 w-3" />}
            onClose={() => setSelectedId(null)}
            hasSelection={!!selectedUser}
            idle={orgSummary}
            footer={itemActions.length > 0 ? <DetailActions actions={itemActions} /> : undefined}
          >
            {selectedUser && (() => {
              const u: any = selectedUser;
              const inactive = u.user_status === 'INACTIVE' || u.is_active === 0;
              const status = u.user_status === 'ON_HOLD' ? 'On hold' : inactive ? 'Inactive' : 'Active';
              const statusClass = u.user_status === 'ON_HOLD' ? 'text-[var(--warning)]' : inactive ? 'text-[var(--danger)]' : 'text-[var(--success)]';
              const roles = (u.roles && u.roles.length > 0 ? u.roles : [{ role_name: u.role_name, is_default: true }])
                .map((r: any) => `${r.role_name}${r.is_default ? ' (default)' : ''}`).join(', ');
              const address = [u.house_apt, u.address, [u.city, u.state].filter(Boolean).join(', '), u.postal_code, u.country].filter(Boolean).join(', ');
              const joined = u.joining_date ? parseApiDate(u.joining_date)?.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : undefined;
              const isEmp = String(u.role_name).toUpperCase() === 'EMPLOYEE';
              return (
                <>
                  <DetailSummary title={u.username} subtitle={`NT${10000 + u.id}${u.department ? ` · ${u.department}` : ''}`} status={status} statusClass={statusClass} />
                  <DetailSection title="Details">
                    <DetailGrid>
                      <DetailField label="Roles" value={roles} wide />
                      <DetailField label="Department" value={u.department || 'Unassigned'} />
                      <DetailField label="Manager" value={u.manager_name || (u.manager_id ? managerName(u.manager_id) : isEmp ? 'None, any manager may approve' : undefined)} />
                      <DetailField label="Joined" value={joined} />
                    </DetailGrid>
                  </DetailSection>
                  <DetailSection title="Contact">
                    <DetailGrid>
                      <DetailField label="Email" value={u.email} wide />
                      <DetailField label="Phone" value={u.contact_no} />
                      <DetailField label="Address" value={address || 'No address on file'} wide />
                    </DetailGrid>
                  </DetailSection>
                  <DetailSection
                    title={`Active allocations (${panelAllocations.length})`}
                    action={isAdmin ? <button type="button" onClick={() => setAllocationModalOpen(true)} className="text-[12px] font-medium text-[var(--shell-accent)] hover:underline">Manage</button> : undefined}
                  >
                    {panelAllocations.length === 0 ? (
                      <p className="text-[12px] text-[var(--shell-text-muted)]">No allocations assigned.</p>
                    ) : (
                      <DetailGrid cols={1}>
                        {panelAllocations.slice(0, 5).map((al) => (
                          <DetailField key={al.id} label={`${al.code} · ${al.type}`} value={[al.client_name, al.category].filter(Boolean).join(' · ')} />
                        ))}
                      </DetailGrid>
                    )}
                  </DetailSection>
                </>
              );
            })()}
          </ModuleIntelligencePanel>
      }
    >
      <DataTable
        isLoading={isLoading}
        columns={userColumns}
        data={users}
        tableInstance={table}
        onRowClick={(row) => setSelectedId(row.id)}
        selectedRowId={selectedId || undefined}
        fullHeight
        emptyMessage={globalFilter ? 'No people match this search.' : 'No team members yet. Use Add to invite the first one.'}
      />

      {confirmDialogEl}

      <UserModal
        isOpen={userModalOpen}
        onClose={() => { setUserModalOpen(false); setEditingUser(null); }}
        onSave={handleSaveUser}
        editing={editingUser}
        roles={roles ?? []}
        managers={managersList}
      />

      <ManageDepartmentsDialog isOpen={departmentsOpen} onClose={() => setDepartmentsOpen(false)} departments={departments ?? []} />

      <AllocationModal
        isOpen={allocationModalOpen}
        onClose={() => setAllocationModalOpen(false)}
        user={selectedUser}
      />

      <PermissionsModal
        isOpen={permissionsModalOpen}
        onClose={() => setPermissionsModalOpen(false)}
        user={selectedUser}
      />
    </ModuleShell>
  );

  if (!canSeeCompany) return peopleView;
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--shell-surface)]">
      <TabBar<OrgTab> value={orgTab} onChange={setOrgTab} tabs={[{ value: 'people', label: 'People' }, { value: 'company', label: 'Company' }]} />
      <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${orgTab}`} className="min-h-0 flex-1">
        {orgTab === 'people' ? peopleView : company ? <CompanyForm company={company} canEdit={isFinanceRole(orgRole)} /> : <p className="p-6 text-[13px] text-[var(--shell-text-muted)]">Loading…</p>}
      </div>
    </div>
  );
}
