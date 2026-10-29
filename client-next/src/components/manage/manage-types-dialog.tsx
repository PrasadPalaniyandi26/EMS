'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api-client';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Field, NativeSelect } from '@/components/shared/modal-primitives';
import { useInvalidate, useTypeUsage, type TypeCategory } from '@/hooks/use-queries';
import { ManageList } from './manage-list';

interface Item { id: number; name: string }

interface Props {
  kind: 'project' | 'product';
  isOpen: boolean;
  onClose: () => void;
  /** Types belong to a client, for projects and products alike */
  clients: { id: number; name: string }[];
  types: (Item & { client_id?: number | null })[];
  categories: TypeCategory[];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Add, rename and remove types (per client) and the categories under them.
// Unused entries are deleted; ones that records use are archived so those records keep their value.
export function ManageTypesDialog({ kind, isOpen, onClose, clients, types, categories }: Props) {
  const invalidate = useInvalidate();
  const { data: usage } = useTypeUsage(kind, isOpen);
  const typeBase = `/${kind}-types`;
  const catBase = `/${kind}-categories`;

  const [clientId, setClientId] = useState('');
  const [typeId, setTypeId] = useState<number | null>(null);

  useEffect(() => { if (isOpen) { setClientId(''); setTypeId(null); } }, [isOpen]);

  const shownTypes = types.filter((t) => String(t.client_id) === clientId);
  const selected = types.find((t) => t.id === typeId) ?? null;
  const shownCategories = categories.filter((c) => c.type_id === typeId);

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
        <Field label="Client">
          <NativeSelect value={clientId} onChange={(e) => { setClientId(e.target.value); setTypeId(null); }}>
            <option value="">Select client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
        {/* Kept free above Categories for a future filter, so both lists start on the same line */}
        <div aria-hidden className="hidden md:block" />

        <ManageList
          heading="Types"
          sectionLabel="Types"
          noun="type"
          items={shownTypes.map((t) => ({ id: t.id, name: t.name, used: usage?.types[t.id] ?? 0 }))}
          selectedId={typeId}
          onPick={setTypeId}
          emptyText={clientId ? 'No types yet.' : 'Choose a client to see its types.'}
          disabled={!clientId}
          taken={(name, exceptId) =>
            types.some((t) => t.id !== exceptId && String(t.client_id) === clientId && same(t.name, name))
              ? `A type named "${name}" already exists for this client` : null}
          onAdd={(name) => done(api.post(typeBase, { name, client_id: Number(clientId) }))}
          onRename={(id, name) => done(api.put(`${typeBase}/${id}`, { name }))}
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
          items={shownCategories.map((c) => ({ id: c.id, name: c.name, used: usage?.categories[c.id] ?? 0 }))}
          emptyText={selected ? 'No categories yet.' : 'Select a type to see its categories.'}
          disabled={!selected}
          taken={(name, exceptId) =>
            categories.some((c) => c.type_id === typeId && c.id !== exceptId && same(c.name, name))
              ? `This type already has a category named "${name}"` : null}
          onAdd={(name) => done(api.post(catBase, { name, type_id: typeId }))}
          onRename={(id, name) => done(api.put(`${catBase}/${id}`, { name }))}
          onRemove={async (id) => (await done(api.delete(`${catBase}/${id}`))).data as any}
          usedBy={kind === 'project' ? 'projects' : 'products'}
        />
      </div>
    </ModuleModal>
  );
}
