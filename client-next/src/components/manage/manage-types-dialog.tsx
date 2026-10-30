'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api-client';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { useInvalidate, useTypeUsage, type TypeCategory } from '@/hooks/use-queries';
import { ManageList } from './manage-list';
import { sortByCode } from '@/lib/codes';

interface Item { id: number; name: string; code?: string | null }

interface Props {
  kind: 'project' | 'product';
  isOpen: boolean;
  onClose: () => void;
  types: Item[];
  categories: TypeCategory[];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Add, rename and remove types and the categories under them. Types are shared by every client:
// a project or product is "client X, name Y, of type Z", chosen when it is created.
// Unused entries are deleted; ones that records use are archived so those records keep their value.
export function ManageTypesDialog({ kind, isOpen, onClose, types, categories }: Props) {
  const invalidate = useInvalidate();
  const { data: usage } = useTypeUsage(kind, isOpen);
  const typeBase = `/${kind}-types`;
  const catBase = `/${kind}-categories`;

  const [typeId, setTypeId] = useState<number | null>(null);

  useEffect(() => { if (isOpen) setTypeId(null); }, [isOpen]);

  const selected = types.find((t) => t.id === typeId) ?? null;
  const shownCategories = sortByCode(categories.filter((c) => c.type_id === typeId));

  const refresh = () => {
    invalidate('projectTypes', 'productTypes', 'projectCategories', 'productCategories', 'typeUsage', 'projects', 'products');
  };
  // The list's callbacks report failure by throwing; the API client's message is shown as the toast
  const done = async <T,>(job: Promise<T>) => { const r = await job; refresh(); return r; };

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Manage ${kind} types and categories`}
      size="xl"
      footer={<Button onClick={onClose} className="h-8 px-5 text-[12px] font-semibold">Done</Button>}
    >
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-6 md:grid-cols-2">
        <ManageList
          heading="Types"
          sectionLabel="Types"
          noun="type"
          withCode
          items={sortByCode(types).map((t) => ({ id: t.id, name: t.name, code: t.code, used: usage?.types[t.id] ?? 0 }))}
          selectedId={typeId}
          onPick={setTypeId}
          emptyText="No types yet."
          taken={(name, exceptId) =>
            types.some((t) => t.id !== exceptId && same(t.name, name)) ? `A type named "${name}" already exists` : null}
          onAdd={(name, code) => done(api.post(typeBase, { name, code: code || undefined }))}
          onRename={(id, name, code) => done(api.put(`${typeBase}/${id}`, { name, code: code ?? null }))}
          onRemove={async (id) => {
            const res = await done(api.delete(`${typeBase}/${id}`));
            if (id === typeId) setTypeId(null);
            return res.data as any;
          }}
          usedBy={kind === 'project' ? 'projects' : 'products'}
          deleteNote=", and its categories are deleted with it"
        />

        <ManageList
          heading={selected ? `Categories of ${selected.name}` : 'Categories'}
          sectionLabel="Categories"
          noun="category"
          withCode
          items={shownCategories.map((c) => ({ id: c.id, name: c.name, code: (c as any).code, used: usage?.categories[c.id] ?? 0 }))}
          emptyText={selected ? 'No categories yet.' : 'Select a type to see its categories.'}
          disabled={!selected}
          taken={(name, exceptId) =>
            categories.some((c) => c.type_id === typeId && c.id !== exceptId && same(c.name, name))
              ? `This type already has a category named "${name}"` : null}
          onAdd={(name, code) => done(api.post(catBase, { name, type_id: typeId, code: code || undefined }))}
          onRename={(id, name, code) => done(api.put(`${catBase}/${id}`, { name, code: code ?? null }))}
          onRemove={async (id) => (await done(api.delete(`${catBase}/${id}`))).data as any}
          usedBy={kind === 'project' ? 'projects' : 'products'}
        />
      </div>
    </ModuleModal>
  );
}
