'use client';

import { Button } from '@/components/ui/button';
import api from '@/lib/api-client';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { useInvalidate, useDepartmentUsage, useUsers, type Department } from '@/hooks/use-queries';
import { NativeSelect } from '@/components/shared/modal-primitives';
import { toast } from 'sonner';
import { ManageList } from './manage-list';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
}

// Departments for users and overhead budgets: one list, managed with the same ManageList as sectors and types.
// Each has an owner, who answers for its overhead budget lines.
export function ManageDepartmentsDialog({ isOpen, onClose, departments }: Props) {
  const invalidate = useInvalidate();
  const { data: usage } = useDepartmentUsage(isOpen);
  const { data: users } = useUsers();
  const staff = (users || []).filter((u) => u.is_active !== 0);
  const setOwner = async (id: number, ownerId: string) => {
    try { await api.put(`/departments/${id}/owner`, { owner_id: ownerId ? Number(ownerId) : null }); invalidate('departments'); }
    catch (e: any) { toast.error(e?.message || 'Could not set the owner'); }
  };
  const done = async <T,>(job: Promise<T>) => { const r = await job; invalidate('departments', 'departmentUsage', 'users', 'budgets'); return r; };

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage departments"
      size="md"
      footer={<Button onClick={onClose} className="h-8 px-5 text-[12px] font-semibold">Done</Button>}
    >
      <ManageList
        heading="Departments"
        sectionLabel="Departments"
        noun="department"
        items={departments.map((d) => ({ id: d.id, name: d.name, used: usage?.departments[d.id] ?? 0 }))}
        emptyText="No departments yet."
        taken={(name, exceptId) =>
          departments.some((d) => d.id !== exceptId && d.name.trim().toLowerCase() === name.trim().toLowerCase())
            ? `A department named "${name}" already exists` : null}
        onAdd={(name) => done(api.post('/departments', { name }))}
        onRename={(id, name) => done(api.put(`/departments/${id}`, { name }))}
        onRemove={async (id) => (await done(api.delete(`/departments/${id}`))).data as any}
        usedBy="users, budget lines and expenses"
        renderExtra={(item) => (
          <NativeSelect
            aria-label={`Owner of ${item.name}`}
            value={String(departments.find((d) => d.id === item.id)?.owner_id ?? '')}
            onChange={(e) => setOwner(item.id, e.target.value)}
            className="!h-8 !w-[110px] shrink-0 !text-[12px]"
          >
            <option value="">No owner</option>
            {staff.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
          </NativeSelect>
        )}
      />
    </ModuleModal>
  );
}
