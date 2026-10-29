'use client';

import { PickSelect } from '@/components/shared/pick-select';
import { useClientSectors, useDepartments } from '@/hooks/use-queries';

interface ReferenceSelectProps {
  value: string;
  onChange: (name: string) => void;
  /** Defaults to "Industry Sector" / "Department" */
  label?: string;
  required?: boolean;
}

// A name list that is stored by name on the record: keep a saved value that is no longer listed (archived)
function withSaved(list: { name: string }[], value: string) {
  const options = list.map((o) => ({ id: o.name, name: o.name }));
  if (value && !options.some((o) => o.id === value)) options.push({ id: value, name: value });
  return options;
}

// Industry sector picker. The list comes from the Sectors dialog (admin), so this only picks.
export function SectorSelect({ value, onChange, label = 'Industry Sector', required }: ReferenceSelectProps) {
  const { data } = useClientSectors();
  return (
    <PickSelect
      label={label}
      required={required}
      placeholder="Select sector"
      value={value}
      onChange={onChange}
      options={withSaved(data ?? [], value)}
      emptyHint="No sectors yet. An admin can add them with Sectors."
    />
  );
}

// Department picker. The list comes from the Departments dialog (admin), so this only picks.
export function DepartmentSelect({ value, onChange, label = 'Department', required }: ReferenceSelectProps) {
  const { data } = useDepartments();
  return (
    <PickSelect
      label={label}
      required={required}
      placeholder="Select department"
      value={value}
      onChange={onChange}
      options={withSaved(data ?? [], value)}
      emptyHint="No departments yet. An admin can add them with Departments."
    />
  );
}
