'use client';

import { useEffect, useState, useMemo } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useUsers, useRoles, useInvalidate } from '@/hooks/use-queries';
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
  useReactTable, 
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
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { columns } from './columns';
import { UserModal, AllocationModal, PermissionsModal } from '@/components/manage/user-modals';
import { cn } from '@/lib/utils';
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

  const table = useReactTable({
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

  return (
    <ModuleShell
      showPanel={!!selectedUser}
      searchRow={
        <DataTableToolbar
          table={table}
          actions={
            <>
              <button className="btn-action" onClick={() => { setEditingUser(null); setUserModalOpen(true); }} disabled={!isAdmin} title={!isAdmin ? 'Admin access required' : undefined}>
                <Plus className="h-4 w-4 text-green-600" /> Add
              </button>
              <button className="btn-action" onClick={() => { if (selectedUser) { setEditingUser(selectedUser); setUserModalOpen(true); } }} disabled={!selectedId || !isAdmin} title={!isAdmin ? 'Admin access required' : undefined}>
                <Pencil className="h-4 w-4 text-blue-600" /> Edit
              </button>
              <button className="btn-action" onClick={() => setAllocationModalOpen(true)} disabled={!selectedId}>
                <Briefcase className="h-4 w-4 text-blue-400" /> Allocation
              </button>
              <button className="btn-action" onClick={() => setPermissionsModalOpen(true)} disabled={!selectedId || !isAdmin} title={!isAdmin ? 'Admin access required' : undefined}>
                <Shield className="h-4 w-4 text-amber-500" /> Permissions
              </button>
              <button className="btn-action" onClick={handleDeactivate} disabled={!selectedId || !isAdmin} title={!isAdmin ? 'Admin access required' : undefined}>
                <UserX className="h-4 w-4 text-rose-500" /> Deactivate
              </button>
            </>
          }
        />
      }
      intelligencePanel={
          <ModuleIntelligencePanel
            title="User Profile"
            icon={<UserIcon className="h-3 w-3" />}
            onClose={() => setSelectedId(null)}
            hasSelection={!!selectedUser}
          >
            {selectedUser && (
            <div className="flex-1 space-y-4 animate-in fade-in slide-in-from-right-6 duration-500 custom-scrollbar overflow-y-auto pr-1">
              {/* Avatar + Identity */}
              <div className="flex items-center gap-4 pb-4" style={{ borderBottom: '1px solid var(--shell-border)' }}>
                <div className="relative shrink-0">
                  <div className="h-14 w-14 rounded-2xl flex items-center justify-center font-black text-lg uppercase shadow-md"
                    style={{ background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)' }}>
                    {(() => { const p = selectedUser.username.trim().split(/\s+/); return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : p[0].slice(0, 2).toUpperCase(); })()}
                  </div>
                  <div className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 shadow ${selectedUser.user_status === 'ON_HOLD' ? 'bg-amber-400' : selectedUser.user_status === 'INACTIVE' || selectedUser.is_active === 0 ? 'bg-rose-400' : 'bg-emerald-400'}`}
                    style={{ borderColor: 'var(--shell-surface)' }} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[14px] font-bold leading-tight truncate" style={{ color: 'var(--shell-text)' }}>{selectedUser.username}</h3>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] mt-0.5" style={{ color: 'var(--shell-accent)' }}>
                    NT{10000 + selectedUser.id}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {(selectedUser.roles && selectedUser.roles.length > 0 ? selectedUser.roles : [{ role_name: selectedUser.role_name, is_default: true }]).map((r, i) => {
                      const colors: Record<string, string> = { admin: 'bg-red-100 text-red-700', finance: 'bg-indigo-100 text-indigo-700', manager: 'bg-orange-100 text-orange-700', employee: 'bg-blue-100 text-blue-600' };
                      const key = (r.role_name || '').toLowerCase();
                      const cls = colors[key] || 'bg-[var(--shell-hover)] text-[var(--shell-text-muted)]';
                      return (
                        <span key={i} className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${cls}`}>
                          {r.role_name}{r.is_default && ' ★'}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Contact & Location — 2 column */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--shell-text-muted)' }}>Contact</p>
                  <div className="flex items-start gap-2">
                    <Mail className="w-3 h-3 shrink-0 mt-0.5" style={{ color: 'var(--shell-text-muted)' }} />
                    <span className="text-[10px] break-all leading-tight" style={{ color: 'var(--shell-text)' }}>{selectedUser.email}</span>
                  </div>
                  {selectedUser.contact_no && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3 h-3 shrink-0" style={{ color: 'var(--shell-text-muted)' }} />
                      <span className="text-[10px]" style={{ color: 'var(--shell-text)' }}>{selectedUser.contact_no}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1" style={{ borderTop: '1px solid var(--shell-border)' }}>
                    <Building2 className="w-3 h-3 shrink-0" style={{ color: 'var(--shell-text-muted)' }} />
                    <span className="text-[10px] font-semibold" style={{ color: 'var(--shell-text)' }}>{selectedUser.department || 'Unassigned'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <UserIcon className="w-3 h-3 shrink-0" style={{ color: 'var(--shell-text-muted)' }} />
                    <span className="text-[10px] font-semibold" style={{ color: 'var(--shell-text)' }}>{selectedUser.manager_name || managerName(selectedUser.manager_id ?? undefined) || '—'}</span>
                  </div>
                </div>
                <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--shell-text-muted)' }}>Location</p>
                  {selectedUser.house_apt && <p className="text-[10px]" style={{ color: 'var(--shell-text)' }}>{selectedUser.house_apt}</p>}
                  {selectedUser.address && <p className="text-[10px]" style={{ color: 'var(--shell-text)' }}>{selectedUser.address}</p>}
                  {selectedUser.city && <p className="text-[10px] font-semibold" style={{ color: 'var(--shell-text)' }}>{selectedUser.city}{selectedUser.postal_code ? ` — ${selectedUser.postal_code}` : ''}</p>}
                  {selectedUser.country && <p className="text-[10px]" style={{ color: 'var(--shell-text-muted)' }}>{selectedUser.country}</p>}
                  {!selectedUser.address && !selectedUser.city && (
                    <p className="text-[10px] italic" style={{ color: 'var(--shell-text-muted)' }}>No address on file</p>
                  )}
                  <div className="flex items-center gap-2 pt-1" style={{ borderTop: '1px solid var(--shell-border)' }}>
                    <Calendar className="w-3 h-3 shrink-0" style={{ color: 'var(--shell-text-muted)' }} />
                    <span className="text-[10px]" style={{ color: 'var(--shell-text)' }}>{selectedUser.joining_date ? new Date(selectedUser.joining_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not set'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-3 h-3 shrink-0" style={{ color: 'var(--shell-text-muted)' }} />
                    <span className="text-[10px] font-semibold" style={{ color: 'var(--shell-accent)' }}>{selectedUser.clearance_level || 'Level 1'}</span>
                  </div>
                </div>
              </div>

              {/* Active Allocations */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: 'var(--shell-text-muted)' }}>
                    <FolderOpen className="w-3 h-3" /> Active Allocations
                  </h4>
                  <span className="text-[9px] font-bold" style={{ color: 'var(--shell-accent)' }}>{panelAllocations.length}</span>
                </div>
                <div className="space-y-1.5">
                  {panelAllocations.length === 0 ? (
                    <p className="text-[10px] italic text-center py-3" style={{ color: 'var(--shell-text-muted)' }}>No allocations assigned</p>
                  ) : panelAllocations.slice(0, 5).map((a) => (
                    <div key={a.id} className="rounded-lg p-2.5" style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[11px] font-semibold leading-none truncate flex-1 mr-2" style={{ color: 'var(--shell-text)' }}>{a.code}</span>
                        <span className="text-[9px] font-bold uppercase shrink-0" style={{ color: 'var(--shell-text-muted)' }}>{a.type}</span>
                      </div>
                      <span className="text-[9px] font-medium" style={{ color: 'var(--shell-text-muted)' }}>{a.client_name} · {a.category}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Performance */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg p-2.5 text-center" style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
                  <p className="text-[9px] uppercase font-bold tracking-widest mb-1" style={{ color: 'var(--shell-text-muted)' }}>Tasks</p>
                  <p className="text-base font-bold" style={{ color: 'var(--shell-text)' }}>12</p>
                </div>
                <div className="rounded-lg p-2.5 text-center" style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
                  <p className="text-[9px] uppercase font-bold tracking-widest mb-1" style={{ color: 'var(--shell-text-muted)' }}>Done</p>
                  <p className="text-base font-bold" style={{ color: 'var(--shell-accent)' }}>9</p>
                </div>
                <div className="rounded-lg p-2.5 text-center" style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
                  <p className="text-[9px] uppercase font-bold tracking-widest mb-1" style={{ color: 'var(--shell-text-muted)' }}>Score</p>
                  <p className="text-base font-bold" style={{ color: 'var(--shell-accent)' }}>A+</p>
                </div>
              </div>

              {/* Quick actions */}
              <div className="grid grid-cols-2 gap-2 pt-2" style={{ borderTop: '1px solid var(--shell-border)' }}>
                <button
                  onClick={() => setAllocationModalOpen(true)}
                  className="flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-colors"
                  style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)', color: 'var(--shell-text)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--shell-accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--shell-accent)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--shell-border)'; (e.currentTarget as HTMLElement).style.color = 'var(--shell-text)'; }}
                >
                  <Briefcase className="w-3.5 h-3.5" /> Allocation
                </button>
                <button
                  onClick={() => setPermissionsModalOpen(true)}
                  className="flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wider text-white transition-all"
                  style={{ background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                >
                  <Shield className="w-3.5 h-3.5" /> Permissions
                </button>
              </div>
            </div>
            )}
          </ModuleIntelligencePanel>
      }
    >
      <DataTable
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
      />

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
