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
import { columns } from './columns';
import { UserModal } from '@/components/manage/user-modal';
import { AllocationModal } from '@/components/manage/allocation-modal';
import { PermissionsModal } from '@/components/manage/permissions-modal';
import { cn } from '@/lib/utils';
import { parseApiDate } from '@/lib/currency';
import { useConfirm } from '@/components/shared/modal-primitives';

export default function OrganizationPage() {
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

  useEffect(() => { 
    setHeader('Team Management', 'Active Users: ' + users.length); 
  }, [setHeader, users.length]);

  const selectedUser = useMemo(() => {
    return users.find(u => u.id === selectedId);
  }, [users, selectedId]);

  const userColumns = useMemo(() => columns(users), [users]);

  const [sorting, setSorting] = useState<SortingState>([]);
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
    } catch {
      toast.error('Failed to save user');
    }
  };

  const handleDeactivate = async () => {
    if (!selectedId) return;
    const ok = await confirmDialog('Deactivate User', `Deactivate account for user #${selectedId}? They will lose access immediately.`, { confirmLabel: 'Deactivate', destructive: true });
    if (!ok) return;
    try {
      await api.put(`/users/${selectedId}`, { isActive: false, user_status: 'INACTIVE' });
      toast.success('Access revoked: User account set to Inactive');
      invalidate('users');
      setSelectedId(null);
    } catch {
      toast.error('Privilege error: Failed to deactivate user');
    }
  };

  const managerName = (id?: number) => users.find(u => u.id === id)?.username || '—';

  const itemActions: DetailActionDef[] = isAdmin && selectedUser ? [
    { label: 'Edit', variant: 'primary', onClick: () => { setEditingUser(selectedUser); setUserModalOpen(true); } },
    { label: 'Permissions', onClick: () => setPermissionsModalOpen(true) },
    { label: 'Deactivate', variant: 'danger', onClick: handleDeactivate },
  ] : [];

  return (
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
            title="User Profile"
            icon={<UserIcon className="h-3 w-3" />}
            onClose={() => setSelectedId(null)}
            hasSelection={!!selectedUser}
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
              const joined = u.joining_date ? parseApiDate(u.joining_date)?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : undefined;
              return (
                <>
                  <DetailSummary title={u.username} subtitle={`NT${10000 + u.id}${u.department ? ` · ${u.department}` : ''}`} status={status} statusClass={statusClass} />
                  <DetailSection title="Details">
                    <DetailGrid>
                      <DetailField label="Roles" value={roles} wide />
                      <DetailField label="Department" value={u.department || 'Unassigned'} />
                      <DetailField label="Manager" value={u.manager_name || managerName(u.manager_id ?? undefined)} />
                      <DetailField label="Joined" value={joined} />
                      <DetailField label="Clearance" value={u.clearance_level || 'Level 1'} />
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
        emptyMessage="No team members found."
      />

      {confirmDialogEl}

      <UserModal
        isOpen={userModalOpen}
        onClose={() => { setUserModalOpen(false); setEditingUser(null); }}
        onSave={handleSaveUser}
        editing={editingUser}
        roles={roles ?? []}
        managers={managersList}
        departments={departments ?? []}
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
}
