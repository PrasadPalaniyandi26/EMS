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
  Check,
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

export default function OrganizationPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = (currentUser?.role_name || '').toLowerCase() === 'admin';
  const { data: usersData, isLoading } = useUsers();
  const { data: roles } = useRoles();
  const { data: managersData } = useQuery({
    queryKey: ['managers'],
    queryFn: () => api.get<any[]>('/users/by-role/managers').then((r) => r.data),
  });
  const invalidate = useInvalidate();
  const users: User[] = Array.isArray(usersData) ? usersData : [];
  const managersList: any[] = Array.isArray(managersData) ? managersData : [];
  
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
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

  const handleSave = async (payload: any) => {
    try {
      if (editing) { 
        await api.put(`/users/${editing.id}`, payload); 
        toast.success('User profile successfully synchronized'); 
      } else { 
        await api.post('/users', payload); 
        toast.success('New recruitment invitation sent'); 
      }
      invalidate('users'); 
      setUserModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save user');
    }
  };

  const handleDeactivate = async () => {
    if (!selectedId) return;
    if (!confirm(`Confirm account deactivation for user record #${selectedId}?`)) return;
    try { 
      await api.delete(`/users/${selectedId}`); 
      toast.success('Access revoked: User account deactivated'); 
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
      actionsRow={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-slate-50 transition-all active:scale-95 shrink-0 disabled:opacity-40"
              onClick={() => { setEditing(null); setUserModalOpen(true); }}
              disabled={!isAdmin}
              title={!isAdmin ? 'Admin access required' : undefined}
            >
              <Plus className="h-[16px] w-[16px] text-green-600" /> Add
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-slate-50 transition-all disabled:opacity-40 active:scale-95"
              onClick={() => { setEditing(selectedUser || null); setUserModalOpen(true); }}
              disabled={!selectedId || !isAdmin}
              title={!isAdmin ? 'Admin access required' : undefined}
            >
              <Pencil className="h-[16px] w-[16px] text-blue-600" /> Edit
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-slate-50 transition-all disabled:opacity-40 active:scale-95"
              onClick={() => setAllocationModalOpen(true)}
              disabled={!selectedId}
            >
              <Briefcase className="h-[16px] w-[16px] text-emerald-500" /> Allocation
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-slate-50 transition-all disabled:opacity-40 active:scale-95"
              onClick={() => setPermissionsModalOpen(true)}
              disabled={!selectedId || !isAdmin}
              title={!isAdmin ? 'Admin access required' : undefined}
            >
              <Shield className="h-[16px] w-[16px] text-amber-500" /> Permissions
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-slate-50 transition-all disabled:opacity-40 active:scale-95"
              onClick={handleDeactivate}
              disabled={!selectedId || !isAdmin}
              title={!isAdmin ? 'Admin access required' : undefined}
            >
              <UserX className="h-[16px] w-[16px] text-rose-500" /> Deactivate
            </button>
          </div>
          
          <div />
        </div>
      }
      searchRow={<DataTableToolbar table={table} />}
      intelligencePanel={
        selectedUser && (
          <ModuleIntelligencePanel
            title="User Profile"
            icon={<UserIcon className="h-3 w-3" />}
            onClose={() => setSelectedId(null)}
          >
            <div className="flex-1 space-y-5 animate-in fade-in slide-in-from-right-6 duration-500 custom-scrollbar overflow-y-auto pr-1">
              {/* Avatar + Identity */}
              <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
                <div className="relative shrink-0">
                  <div className="h-16 w-16 rounded-2xl border-2 border-juniper/20 bg-[#F0F4F5] flex items-center justify-center font-black text-juniper text-xl uppercase shadow-md">
                    {selectedUser.username.substring(0, 2)}
                  </div>
                  <div className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white shadow ${selectedUser.user_status === 'ON_HOLD' ? 'bg-amber-400' : selectedUser.user_status === 'INACTIVE' || selectedUser.is_active === 0 ? 'bg-rose-400' : 'bg-emerald-500'}`} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-black text-slate-800 leading-tight truncate">{selectedUser.username}</h3>
                  <p className="text-[10px] font-black text-juniper uppercase tracking-[0.15em] mt-0.5">
                    NT{10000 + selectedUser.id}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(selectedUser.roles && selectedUser.roles.length > 0 ? selectedUser.roles : [{ role_name: selectedUser.role_name, is_default: true }]).map((r, i) => {
                      const colors: Record<string, string> = { admin: 'bg-red-100 text-red-700', finance: 'bg-emerald-100 text-emerald-700', manager: 'bg-orange-100 text-orange-700', employee: 'bg-blue-100 text-blue-600' };
                      const key = (r.role_name || '').toLowerCase();
                      const cls = colors[key] || 'bg-slate-100 text-slate-600';
                      return (
                        <span key={i} className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${cls}`}>
                          {r.role_name}{r.is_default && ' ★'}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Contact & Employment — 2 column */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#F8FAFB] rounded-xl border border-slate-100 p-3 space-y-2">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Contact</p>
                  <div className="flex items-start gap-2">
                    <Mail className="w-3 h-3 text-casper shrink-0 mt-0.5" />
                    <span className="text-[10px] text-slate-600 break-all leading-tight">{selectedUser.email}</span>
                  </div>
                  {selectedUser.contact_no && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3 h-3 text-casper shrink-0" />
                      <span className="text-[10px] text-slate-600">{selectedUser.contact_no}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                    <Building2 className="w-3 h-3 text-casper shrink-0" />
                    <span className="text-[10px] font-bold text-slate-700">{selectedUser.department || 'Unassigned'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <UserIcon className="w-3 h-3 text-casper shrink-0" />
                    <span className="text-[10px] text-slate-500">→ <span className="font-bold text-slate-700">{selectedUser.manager_name || managerName(selectedUser.manager_id ?? undefined)}</span></span>
                  </div>
                </div>
                <div className="bg-[#F8FAFB] rounded-xl border border-slate-100 p-3 space-y-2">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Location</p>
                  {selectedUser.house_apt && <p className="text-[10px] text-slate-600">{selectedUser.house_apt}</p>}
                  {selectedUser.address && <p className="text-[10px] text-slate-600">{selectedUser.address}</p>}
                  {selectedUser.city && <p className="text-[10px] font-bold text-slate-700">{selectedUser.city}{selectedUser.postal_code ? ` — ${selectedUser.postal_code}` : ''}</p>}
                  {selectedUser.country && <p className="text-[10px] text-slate-600">{selectedUser.country}</p>}
                  {!selectedUser.address && !selectedUser.city && (
                    <p className="text-[10px] text-slate-300 italic">No address on file</p>
                  )}
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                    <Calendar className="w-3 h-3 text-casper shrink-0" />
                    <span className="text-[10px] text-slate-600">{selectedUser.joining_date ? new Date(selectedUser.joining_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not set'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-3 h-3 text-casper shrink-0" />
                    <span className="text-[10px] font-bold text-juniper">{selectedUser.clearance_level || 'Level 1'}</span>
                  </div>
                </div>
              </div>

              {/* Active Allocations */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                    <FolderOpen className="w-3 h-3" /> Active Allocations
                  </h4>
                  <span className="text-[9px] font-black text-juniper">{panelAllocations.length}</span>
                </div>
                <div className="space-y-2">
                  {panelAllocations.length === 0 ? (
                    <p className="text-[10px] text-slate-300 italic text-center py-3">No allocations assigned</p>
                  ) : panelAllocations.slice(0, 5).map((a) => {
                    const catColor = a.category === 'Project' ? 'bg-juniper' : 'bg-blue-400';
                    return (
                      <div key={a.id} className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-bold text-charcoal leading-none truncate flex-1 mr-2">{a.code}</span>
                          <span className="text-[9px] font-black text-slate-400 uppercase shrink-0">{a.type}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`h-1.5 w-1.5 rounded-full ${catColor} shrink-0`} />
                          <span className="text-[9px] text-slate-400 font-bold">{a.client_name} · {a.category}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Performance */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white border border-slate-100 rounded-xl p-3 text-center shadow-sm">
                  <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-1">Tasks</p>
                  <p className="text-lg font-black text-slate-800">12</p>
                </div>
                <div className="bg-white border border-slate-100 rounded-xl p-3 text-center shadow-sm">
                  <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-1">Done</p>
                  <p className="text-lg font-black text-emerald-500">9</p>
                </div>
                <div className="bg-white border border-slate-100 rounded-xl p-3 text-center shadow-sm">
                  <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-1">Score</p>
                  <p className="text-lg font-black text-juniper">A+</p>
                </div>
              </div>

              {/* Allocation + Permissions quick actions */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setAllocationModalOpen(true)}
                  className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  <Briefcase className="w-3.5 h-3.5" /> Allocation
                </button>
                <button
                  onClick={() => setPermissionsModalOpen(true)}
                  className="flex items-center justify-center gap-2 bg-juniper hover:brightness-110 text-white py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-juniper/20 transition-all"
                >
                  <Shield className="w-3.5 h-3.5" /> Permissions
                </button>
              </div>
            </div>
          </ModuleIntelligencePanel>
        )
      }
    >
      <DataTable 
        columns={userColumns} 
        data={users} 
        tableInstance={table}
        onRowClick={(row) => setSelectedId(row.id)}
        selectedRowId={selectedId || undefined}
        fullHeight
      />

      <UserModal
        isOpen={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        onSave={handleSave}
        editing={editing}
        roles={roles || []}
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
