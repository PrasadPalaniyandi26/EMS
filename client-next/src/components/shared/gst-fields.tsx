'use client';

import { Switch } from '@/components/ui/switch';
import { NativeSelect } from '@/components/shared/modal-primitives';
import { GST_RATES } from '@/lib/gst';

// GST rate dropdown and the "included in amount" switch, shared by the transaction and recurring dialogs.
export function GstRateSelect({ value, onChange, emptyLabel }: { value: string; onChange: (v: string) => void; emptyLabel: string }) {
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {GST_RATES.map((r) => <option key={r} value={r}>{r}</option>)}
    </NativeSelect>
  );
}

export function GstIncludedSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex h-10 w-[124px] shrink-0 cursor-pointer items-center gap-2.5 text-[12px] font-semibold text-[var(--shell-text-muted)]">
      <Switch checked={checked} onCheckedChange={onChange} aria-label="GST included in amount" />
      <span className="whitespace-nowrap">{checked ? 'Included' : 'Not included'}</span>
    </label>
  );
}
