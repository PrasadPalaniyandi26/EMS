'use client';

import { useState, useEffect } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import api from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Field, NativeSelect, ConfirmDialog, inp } from '@/components/shared/modal-primitives';
import { useInvalidate, useTypeUsage, type TypeCategory } from '@/hooks/use-queries';

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

type Target = { scope: 'type' | 'category'; item: Item; used: number };

// One place to add, rename and remove types and the categories under them.
// Unused entries are deleted; ones that records use are archived so those records keep their value.
export function ManageTypesDialog({ kind, isOpen, onClose, clients, types, categories }: Props) {
  const invalidate = useInvalidate();
  const { data: usage } = useTypeUsage(kind, isOpen);
  const noun = kind === 'project' ? 'project' : 'product';
  const typeBase = `/${kind}-types`;
  const catBase = `/${kind}-categories`;

  const [clientId, setClientId] = useState('');
  const [typeId, setTypeId] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ scope: 'type' | 'category'; id: number } | null>(null);
  const [draft, setDraft] = useState('');
  const [newType, setNewType] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [target, setTarget] = useState<Target | null>(null);

  useEffect(() => {
    if (isOpen) { setClientId(''); setTypeId(null); setEditing(null); setNewType(''); setNewCategory(''); setTarget(null); }
  }, [isOpen]);

  const shownTypes = types.filter((t) => String(t.client_id) === clientId);
  const selected = types.find((t) => t.id === typeId) ?? null;
  const shownCategories = categories.filter((c) => c.type_id === typeId);

  const refresh = () => {
    invalidate('projectTypes', 'productTypes', 'projectCategories', 'productCategories', 'typeUsage', 'projects', 'products');
  };

  const run = async (job: () => Promise<unknown>, done?: string) => {
    try { await job(); refresh(); if (done) toast.success(done); return true; }
    catch (e: any) { toast.error(e?.message || 'Something went wrong'); return false; }
  };

  // Names are unique ignoring case: types within a client, categories within a type. The server enforces it too.
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const typeTaken = (name: string, scopeClient: number | null | undefined, exceptId?: number) =>
    types.some((t) => t.id !== exceptId && (t.client_id ?? null) === (scopeClient ?? null) && same(t.name, name));
  const categoryTaken = (name: string, ofType: number, exceptId?: number) =>
    categories.some((c) => c.type_id === ofType && c.id !== exceptId && same(c.name, name));

  const addType = async () => {
    const name = newType.trim();
    if (!name) return;
    if (!clientId) { toast.error('Choose a client first'); return; }
    if (typeTaken(name, Number(clientId))) { toast.error(`A type named "${name}" already exists for this client`); return; }
    const ok = await run(() => api.post(typeBase, { name, client_id: Number(clientId) }), 'Type added');
    if (ok) setNewType('');
  };

  const addCategory = async () => {
    const name = newCategory.trim();
    if (!name || !typeId) return;
    if (categoryTaken(name, typeId)) { toast.error(`This type already has a category named "${name}"`); return; }
    const ok = await run(() => api.post(catBase, { name, type_id: typeId }), 'Category added');
    if (ok) setNewCategory('');
  };

  const saveRename = async () => {
    if (!editing) return;
    const name = draft.trim();
    if (!name) return;
    if (editing.scope === 'type') {
      const own = types.find((t) => t.id === editing.id);
      if (typeTaken(name, own?.client_id, editing.id)) { toast.error(`A type named "${name}" already exists`); return; }
    } else {
      const own = categories.find((c) => c.id === editing.id);
      if (own && categoryTaken(name, own.type_id, editing.id)) { toast.error(`This type already has a category named "${name}"`); return; }
    }
    const url = editing.scope === 'type' ? `${typeBase}/${editing.id}` : `${catBase}/${editing.id}`;
    const ok = await run(() => api.put(url, { name }), 'Renamed');
    if (ok) setEditing(null);
  };

  const confirmRemove = async () => {
    if (!target) return;
    const url = target.scope === 'type' ? `${typeBase}/${target.item.id}` : `${catBase}/${target.item.id}`;
    try {
      const res = await api.delete(url);
      const archived = (res.data as any)?.archived;
      refresh();
      if (target.scope === 'type' && target.item.id === typeId) setTypeId(null);
      toast.success(archived ? 'Archived: existing records keep it' : 'Deleted');
    } catch (e: any) {
      toast.error(e?.message || 'Could not remove');
    }
    setTarget(null);
  };

  const row = (scope: 'type' | 'category', item: Item, used: number, active: boolean, onPick?: () => void) => {
    const isEditing = editing?.scope === scope && editing.id === item.id;
    return (
      <li key={`${scope}-${item.id}`} className={cn('relative flex items-center gap-2 border-b px-3 py-2 last:border-b-0', (active || isEditing) && 'bg-[var(--shell-accent)]/15')} style={{ borderColor: 'var(--shell-border)' }}>
        {(active || isEditing) && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[var(--shell-accent)]" />}
        {isEditing ? (
          <>
            <input
              autoFocus
              aria-label={`Rename ${item.name}`}
              className={cn(inp, 'h-8 min-w-0 flex-1')}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); saveRename(); }
                if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); }
              }}
            />
            <Button type="button" variant="ghost" aria-label="Save name" className="h-8 w-8 p-0" onClick={saveRename}><Check aria-hidden className="h-4 w-4" /></Button>
            <Button type="button" variant="ghost" aria-label="Cancel rename" className="h-8 w-8 p-0" onClick={() => setEditing(null)}><X aria-hidden className="h-4 w-4" /></Button>
          </>
        ) : (
          <>
            {onPick ? (
              <button type="button" aria-pressed={active} onClick={onPick} className={cn('min-w-0 flex-1 truncate text-left text-[13px]', active ? 'font-semibold' : 'font-medium')} style={{ color: 'var(--shell-text)' }}>{item.name}</button>
            ) : (
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium" style={{ color: 'var(--shell-text)' }}>{item.name}</span>
            )}
            <span className="shrink-0 text-[12px]" style={{ color: 'var(--shell-text-muted)' }}>{used > 0 ? `${used} in use` : 'Unused'}</span>
            <Button type="button" variant="ghost" aria-label={`Rename ${item.name}`} className="h-8 w-8 p-0" onClick={() => { setEditing({ scope, id: item.id }); setDraft(item.name); }}><Pencil aria-hidden className="h-4 w-4" /></Button>
            <Button type="button" variant="ghost" aria-label={`Remove ${item.name}`} className="h-8 w-8 p-0 text-[var(--danger)]" onClick={() => setTarget({ scope, item, used })}><Trash2 aria-hidden className="h-4 w-4" /></Button>
          </>
        )}
      </li>
    );
  };

  const list = (children: React.ReactNode, empty: string, count: number) => (
    // Five rows tall (49px each) whether it holds 0 or 50 entries, so the two lists and their add boxes line up
    <ul className="h-[245px] overflow-y-auto rounded-md border" style={{ borderColor: 'var(--input)' }}>
      {count === 0 ? <li className="flex h-full items-center justify-center px-3 text-center text-[13px]" style={{ color: 'var(--shell-text-muted)' }}>{empty}</li> : children}
    </ul>
  );

  const adder = (label: string, value: string, onChange: (v: string) => void, onAdd: () => void, disabled: boolean) => (
    <div className="mt-3 flex gap-2">
      <input aria-label={label} className={cn(inp, 'min-w-0 flex-1')} placeholder={label} value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }} />
      <Button type="button" onClick={onAdd} disabled={disabled || !value.trim()} className="h-10 px-4 text-[12px] font-semibold">Add</Button>
    </div>
  );

  const removeMessage = target
    ? target.used > 0
      ? `"${target.item.name}" is used by ${target.used} ${noun}${target.used === 1 ? '' : 's'}. It will be archived: they keep it, but it no longer appears in the lists.`
      : `Delete "${target.item.name}"? Nothing uses it${target.scope === 'type' ? ', and its categories are deleted with it' : ''}.`
    : '';

  return (
    <>
      <ModuleModal
        isOpen={isOpen}
        onClose={onClose}
        title={`Manage ${noun} types and categories`}
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
          <section aria-label="Types">
            <h3 className="mb-2 text-[13px] font-semibold" style={{ color: 'var(--shell-text)' }}>Types</h3>
            {list(
              shownTypes.map((t) => row('type', t, usage?.types[t.id] ?? 0, t.id === typeId, () => setTypeId(t.id))),
              !clientId ? 'Choose a client to see its types.' : 'No types yet.',
              shownTypes.length,
            )}
            {adder('New type name', newType, setNewType, addType, !clientId)}
          </section>

          <section aria-label="Categories">
            <h3 className="mb-2 text-[13px] font-semibold" style={{ color: 'var(--shell-text)' }}>
              {selected ? `Categories of ${selected.name}` : 'Categories'}
            </h3>
            {list(
              shownCategories.map((c) => row('category', c, usage?.categories[c.id] ?? 0, false)),
              selected ? 'No categories yet.' : 'Select a type to see its categories.',
              shownCategories.length,
            )}
            {adder('New category name', newCategory, setNewCategory, addCategory, !selected)}
          </section>
        </div>
      </ModuleModal>

      <ConfirmDialog
        open={!!target}
        title={target?.used ? `Archive ${target.scope}` : `Delete ${target?.scope ?? ''}`}
        message={removeMessage}
        confirmLabel={target?.used ? 'Archive' : 'Delete'}
        destructive
        onConfirm={confirmRemove}
        onCancel={() => setTarget(null)}
      />
    </>
  );
}
