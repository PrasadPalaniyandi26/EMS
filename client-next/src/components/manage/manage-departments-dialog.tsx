'use client';

import { Button } from '@/components/ui/button';
import api from '@/lib/api-client';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { useInvalidate, useDepartmentUsage, type Department } from '@/hooks/use-queries';
import { ManageList } from './manage-list';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
}

// Departments for users and budgets: one list, managed with the same ManageList as sectors and types.
export function ManageDepartmentsDialog({ isOpen, onClose, departments }: Props) {
  const invalidate = useInvalidate();
  const { data: usage } = useDepartmentUsage(isOpen);
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
        usedBy="users and budgets"
      />
    </ModuleModal>
  );
}
