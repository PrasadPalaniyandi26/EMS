'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api-client';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { SegmentedControl } from '@/components/shared/modal-primitives';
import { useInvalidate, useCategories, useCategoryTypes, useCategoryUsage } from '@/hooks/use-queries';
import { ManageList } from './manage-list';

type Kind = 'expense' | 'income';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** The kinds this page deals with. With more than one, the dialog shows a switch between them. */
  kinds: Kind[];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Add, rename and remove the types and categories for expenses or income (Type > Category).
// Entries that records use are archived rather than deleted, so those records keep them.
export function ManageCategoriesDialog({ isOpen, onClose, kinds }: Props) {
  const invalidate = useInvalidate();
  const [kind, setKind] = useState<Kind>(kinds[0]);
  const [typeId, setTypeId] = useState<number | null>(null);

  const { data: allTypes } = useCategoryTypes();
  const { data: allCategories } = useCategories();
  const { data: usage } = useCategoryUsage(kind, isOpen);

  useEffect(() => { if (isOpen) { setKind(kinds[0]); setTypeId(null); } }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const types = (allTypes || []).filter((t) => t.kind === kind);
  const categories = (allCategories || []).filter((c) => c.type === kind && c.type_id === typeId);
  const selected = types.find((t) => t.id === typeId) ?? null;

  const refresh = () => invalidate('categoryTypes', 'categories', 'categoryUsage');
  const done = async <T,>(job: Promise<T>) => { const r = await job; refresh(); return r; };

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage categories"
      size="xl"
      footer={<Button onClick={onClose} className="h-8 px-5 text-[12px] font-semibold">Done</Button>}
    >
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-6 md:grid-cols-2">
        {kinds.length > 1 ? (
          <>
            <div>
              <p id="category-kind-label" className="mb-2 block text-[13px] font-medium" style={{ color: 'var(--shell-text)' }}>For</p>
              <SegmentedControl
                labelledBy="category-kind-label"
                value={kind}
                onChange={(v) => { setKind(v as Kind); setTypeId(null); }}
                options={kinds.map((k) => ({ value: k, label: k === 'expense' ? 'Expenses' : 'Income', tone: k === 'expense' ? 'danger' : 'success' }))}
              />
            </div>
            <div aria-hidden className="hidden md:block" />
          </>
        ) : null}

        <ManageList
          heading="Types"
          sectionLabel="Types"
          noun="type"
          items={types.map((t) => ({ id: t.id, name: t.name, used: usage?.types[t.id] ?? 0 }))}
          selectedId={typeId}
          onPick={setTypeId}
          emptyText="No types yet."
          taken={(name, exceptId) =>
            types.some((t) => t.id !== exceptId && same(t.name, name)) ? `A type named "${name}" already exists` : null}
          onAdd={(name) => done(api.post('/category-types', { name, kind }))}
          onRename={(id, name) => done(api.put(`/category-types/${id}`, { name }))}
          onRemove={async (id) => {
            const res = await done(api.delete(`/category-types/${id}`));
            if (id === typeId) setTypeId(null);
            return res.data as any;
          }}
          usedBy="transactions, budgets and schedules"
          deleteNote=", and its categories are deleted with it"
        />

        <ManageList
          heading={selected ? `Categories of ${selected.name}` : 'Categories'}
          sectionLabel="Categories"
          noun="category"
          items={categories.map((c) => ({ id: c.id, name: c.name, used: usage?.categories[c.id] ?? 0 }))}
          emptyText={selected ? 'No categories yet.' : 'Select a type to see its categories.'}
          disabled={!selected}
          taken={(name, exceptId) =>
            categories.some((c) => c.id !== exceptId && same(c.name, name)) ? `This type already has a category named "${name}"` : null}
          onAdd={(name) => done(api.post('/categories', { name, type: kind, type_id: typeId }))}
          onRename={(id, name) => done(api.put(`/categories/${id}`, { name }))}
          onRemove={async (id) => (await done(api.delete(`/categories/${id}`))).data as any}
          usedBy="transactions, budgets and schedules"
        />
      </div>
    </ModuleModal>
  );
}
