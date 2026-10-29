'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, NativeSelect, inp } from '@/components/shared/modal-primitives';

const NEW = '__new__';

interface CreatableSelectProps {
  label: string;
  value: string;
  onChange: (id: string) => void;
  options: { id: number | string; name: string }[];
  /** What is being created, in lower case: "type", "category" */
  noun: string;
  placeholder: string;
  /** Creates the item and resolves to it; the new item is then selected */
  /** Leave out for people who may only pick: the "Create new" option is then not offered */
  onCreate?: (name: string) => Promise<{ id?: number | string } | undefined | void>;
  /** Explains why the list is unavailable (e.g. nothing chosen above it yet); the list is disabled while it is set */
  blockedHint?: string;
  required?: boolean;
}

// Dropdown with "Create new …" as its last option. Picking it opens a one-line input in place,
// so adding an entry never leaves the dialog or needs a separate button under the field.
export function CreatableSelect({ label, value, onChange, options, noun, placeholder, onCreate, blockedHint, required }: CreatableSelectProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => { setCreating(false); setName(''); };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy || !onCreate) return;
    setBusy(true);
    try {
      const made = await onCreate(trimmed);
      if (made && made.id) onChange(String(made.id));
      close();
    } catch {
      // the caller reports the error
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label={label} required={required} hint={blockedHint}>
      <NativeSelect
        value={creating ? NEW : value}
        disabled={!!blockedHint}
        onChange={(e) => {
          if (e.target.value === NEW) setCreating(true);
          else { close(); onChange(e.target.value); }
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        {onCreate && <option value={NEW}>+ Create new {noun}…</option>}
      </NativeSelect>
      {creating && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            aria-label={`New ${noun} name`}
            className={`${inp} min-w-0 flex-1`}
            placeholder={`New ${noun} name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); create(); }
              if (e.key === 'Escape') { e.stopPropagation(); close(); }
            }}
          />
          <Button type="button" onClick={create} disabled={busy || !name.trim()} className="h-10 px-4 text-[12px] font-semibold">Add</Button>
          <Button type="button" variant="ghost" onClick={close} className="h-10 px-3 text-[12px]">Cancel</Button>
        </div>
      )}
    </Field>
  );
}
