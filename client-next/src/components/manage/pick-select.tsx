'use client';

import { Field, NativeSelect } from '@/components/shared/modal-primitives';

interface PickSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: number | string; name: string }[];
  placeholder: string;
  required?: boolean;
  /** Disabled until what it depends on (client, type) is chosen */
  disabled?: boolean;
  /** Shown when the list is available but has no entries */
  emptyHint?: string;
}

// Dropdown for reference data (types, categories, sectors) that people only pick from.
// The lists are maintained by an admin in the Types and Sectors dialogs, not from inside a form.
export function PickSelect({ label, value, onChange, options, placeholder, required, disabled, emptyHint }: PickSelectProps) {
  const hint = !disabled && options.length === 0 ? emptyHint : undefined;
  return (
    <Field label={label} required={required} hint={hint}>
      <NativeSelect value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </NativeSelect>
    </Field>
  );
}
