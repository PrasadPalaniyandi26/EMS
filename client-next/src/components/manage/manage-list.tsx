'use client';

import { useState, type ReactNode } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ConfirmDialog, inp } from '@/components/shared/modal-primitives';

export interface ManageItem { id: number; name: string; used: number; code?: string | null }

interface ManageListProps {
  /** Heading above the list, e.g. "Types" or "Categories of Software" */
  heading: string;
  /** Names the list for screen readers, e.g. "Types" */
  sectionLabel: string;
  /** Singular, lower case: "type", "category", "sector" */
  noun: string;
  items: ManageItem[];
  /** Give both to make rows selectable (a list that others depend on) */
  selectedId?: number | null;
  onPick?: (id: number) => void;
  emptyText: string;
  /** Disables adding, e.g. until the list above it has a selection */
  disabled?: boolean;
  /** Explains why a name can't be used (duplicate), or null when it is free */
  taken: (name: string, exceptId?: number) => string | null;
  /** The callbacks call the API and refresh; they throw to report a failure */
  onAdd: (name: string, code?: string) => Promise<unknown>;
  onRename: (id: number, name: string, code?: string) => Promise<unknown>;
  /** Shows a short code (E200, J110) beside each name and asks for it when adding or renaming */
  withCode?: boolean;
  /** Extra control per row, such as the owner of a department */
  renderExtra?: (item: ManageItem) => ReactNode;
  onRemove: (id: number) => Promise<{ archived?: boolean } | void>;
  /** What uses an entry, for the remove message: "projects", "clients" */
  usedBy: string;
  /** Extra consequence of deleting an unused entry */
  deleteNote?: string;
}

// The one list used for managing reference data: sectors today, types and categories in the types dialog.
// Rows show how many records use them, can be renamed in place, and are deleted when unused or archived when used.
// Five rows tall whatever the content, so lists placed side by side line up.
export function ManageList({
  heading, sectionLabel, noun, items, selectedId, onPick, emptyText, disabled, taken, onAdd, onRename, onRemove, usedBy, deleteNote, withCode, renderExtra,
}: ManageListProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [draftCode, setDraftCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [target, setTarget] = useState<ManageItem | null>(null);

  const attempt = async (job: () => Promise<unknown>, done: string) => {
    try { await job(); toast.success(done); return true; }
    catch (e: any) { toast.error(e?.message || 'Something went wrong'); return false; }
  };

  const add = async () => {
    const name = newName.trim();
    if (!name || disabled) return;
    const clash = taken(name);
    if (clash) { toast.error(clash); return; }
    if (await attempt(() => onAdd(name, withCode ? newCode.trim() : undefined), `${cap(noun)} added`)) { setNewName(''); setNewCode(''); }
  };

  const saveRename = async () => {
    if (editingId == null) return;
    const name = draft.trim();
    if (!name) return;
    const clash = taken(name, editingId);
    if (clash) { toast.error(clash); return; }
    if (await attempt(() => onRename(editingId, name, withCode ? draftCode.trim() : undefined), 'Saved')) setEditingId(null);
  };

  const confirmRemove = async () => {
    if (!target) return;
    try {
      const res = await onRemove(target.id);
      toast.success(res && res.archived ? 'Archived: existing records keep it' : 'Deleted');
    } catch (e: any) {
      toast.error(e?.message || 'Could not remove');
    }
    setTarget(null);
  };

  const removeMessage = target
    ? target.used > 0
      ? `"${target.name}" is used by ${target.used} ${usedBy}. It will be archived: they keep it, but it no longer appears in the lists.`
      : `Delete "${target.name}"? Nothing uses it${deleteNote ?? ''}.`
    : '';

  return (
    <section aria-label={sectionLabel}>
      <h3 className="mb-2 text-[13px] font-semibold" style={{ color: 'var(--shell-text)' }}>{heading}</h3>

      <ul className="h-[245px] overflow-y-auto rounded-md border" style={{ borderColor: 'var(--input)' }}>
        {items.length === 0 ? (
          <li className="flex h-full items-center justify-center px-3 text-center text-[13px]" style={{ color: 'var(--shell-text-muted)' }}>{emptyText}</li>
        ) : items.map((item) => {
          const isEditing = editingId === item.id;
          const active = selectedId === item.id;
          return (
            <li key={item.id} className={cn('relative flex items-center gap-2 border-b px-3 py-2 last:border-b-0', (active || isEditing) && 'bg-[var(--shell-accent)]/15')} style={{ borderColor: 'var(--shell-border)' }}>
              {(active || isEditing) && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[var(--shell-accent)]" />}
              {isEditing ? (
                <>
                  {withCode && (
                    <input
                      aria-label={`Code for ${item.name}`}
                      className={cn(inp, 'h-8 w-[76px] shrink-0')}
                      placeholder="Code"
                      maxLength={10}
                      value={draftCode}
                      onChange={(e) => setDraftCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); saveRename(); }
                        if (e.key === 'Escape') { e.stopPropagation(); setEditingId(null); }
                      }}
                    />
                  )}
                  <input
                    autoFocus
                    aria-label={`Rename ${item.name}`}
                    className={cn(inp, 'h-8 min-w-0 flex-1')}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); saveRename(); }
                      if (e.key === 'Escape') { e.stopPropagation(); setEditingId(null); }
                    }}
                  />
                  <Button type="button" variant="ghost" aria-label="Save name" className="h-8 w-8 p-0" onClick={saveRename}><Check aria-hidden className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" aria-label="Cancel rename" className="h-8 w-8 p-0" onClick={() => setEditingId(null)}><X aria-hidden className="h-4 w-4" /></Button>
                </>
              ) : (
                <>
                  {onPick ? (
                    <button type="button" aria-pressed={active} onClick={() => onPick(item.id)} className={cn('min-w-0 flex-1 truncate text-left text-[13px]', active ? 'font-semibold' : 'font-medium')} style={{ color: 'var(--shell-text)' }}>{item.code && <span className="mr-2 text-[12px] font-normal" style={{ color: 'var(--shell-text-muted)' }}>{item.code}</span>}{item.name}</button>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium" style={{ color: 'var(--shell-text)' }}>{item.code && <span className="mr-2 text-[12px] font-normal" style={{ color: 'var(--shell-text-muted)' }}>{item.code}</span>}{item.name}</span>
                  )}
                  {renderExtra?.(item)}
                  <span className="shrink-0 text-[12px]" style={{ color: 'var(--shell-text-muted)' }}>{item.used > 0 ? `${item.used} in use` : 'Unused'}</span>
                  <Button type="button" variant="ghost" aria-label={`Rename ${item.name}`} className="h-8 w-8 p-0" onClick={() => { setEditingId(item.id); setDraft(item.name); setDraftCode(item.code ?? ''); }}><Pencil aria-hidden className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" aria-label={`Remove ${item.name}`} className="h-8 w-8 p-0 text-[var(--danger)]" onClick={() => setTarget(item)}><Trash2 aria-hidden className="h-4 w-4" /></Button>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex gap-2">
        {withCode && (
          <input
            aria-label={`New ${noun} code`}
            className={cn(inp, 'w-[84px] shrink-0')}
            placeholder="Code"
            maxLength={10}
            value={newCode}
            disabled={disabled}
            onChange={(e) => setNewCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          />
        )}
        <input
          aria-label={`New ${noun} name`}
          className={cn(inp, 'min-w-0 flex-1')}
          placeholder={`New ${noun} name`}
          value={newName}
          disabled={disabled}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <Button type="button" onClick={add} disabled={disabled || !newName.trim()} className="h-10 px-4 text-[12px] font-semibold">Add</Button>
      </div>

      <ConfirmDialog
        open={!!target}
        title={target?.used ? `Archive ${noun}` : `Delete ${noun}`}
        message={removeMessage}
        confirmLabel={target?.used ? 'Archive' : 'Delete'}
        destructive
        onConfirm={confirmRemove}
        onCancel={() => setTarget(null)}
      />
    </section>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
