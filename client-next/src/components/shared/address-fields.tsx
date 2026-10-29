'use client';

import { Input } from '@/components/ui/input';
import { Field, NativeSelect, inp } from '@/components/shared/modal-primitives';
import { COUNTRY_LIST } from '@/lib/countries';

export type AddressKey = 'street' | 'line2' | 'city' | 'state' | 'country' | 'postal_code';
export type AddressValue = Record<AddressKey, string>;

interface AddressFieldsProps {
  value: AddressValue;
  onChange: (key: AddressKey, value: string) => void;
}

// The one address block, used wherever an address is entered (clients, users, ...).
// It is a plain stack of fields, so it drops into any column. The caller maps these keys to its own
// field names, so the order, labels and country list stay the same everywhere.
export function AddressFields({ value, onChange }: AddressFieldsProps) {
  return (
    <>
      <Field label="Street">
        <Input className={inp} placeholder="123 Main Street" value={value.street} onChange={(e) => onChange('street', e.target.value)} />
      </Field>
      <Field label="Address (optional)">
        <Input className={inp} placeholder="Apt / Suite / Building" value={value.line2} onChange={(e) => onChange('line2', e.target.value)} />
      </Field>
      <Field label="City">
        <Input className={inp} placeholder="City" value={value.city} onChange={(e) => onChange('city', e.target.value)} />
      </Field>
      <Field label="State / County">
        <Input className={inp} placeholder="State, province or county" value={value.state} onChange={(e) => onChange('state', e.target.value)} />
      </Field>
      <Field label="Country">
        <NativeSelect value={value.country} onChange={(e) => onChange('country', e.target.value)}>
          <option value="">Select country</option>
          {COUNTRY_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Postal Code">
        <Input className={inp} placeholder="ZIP / Postal" value={value.postal_code} onChange={(e) => onChange('postal_code', e.target.value)} />
      </Field>
    </>
  );
}
