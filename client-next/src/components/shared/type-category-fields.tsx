'use client';

import { PickSelect } from '@/components/shared/pick-select';

interface TypeOption { id: number | string; name: string }
interface CategoryOption { id: number | string; type_id?: number | string | null; name: string }

interface TypeCategoryFieldsProps {
  typeLabel: string;
  categoryLabel: string;
  types: TypeOption[];
  /** Every category; the ones shown are those of the chosen type */
  categories: CategoryOption[];
  typeId: string;
  /** The category as the record stores it: its name (projects, products) or its id (transactions, schedules) */
  category: string;
  categoryBy: 'name' | 'id';
  /** Called with both values so the parent updates its form in one step; changing the type clears the category */
  onChange: (next: { typeId: string; category: string }) => void;
  typeRequired?: boolean;
  categoryRequired?: boolean;
  typeEmptyHint?: string;
  categoryEmptyHint?: string;
}

// The Type > Category pair used wherever something is classified (projects, products, expenses, income, schedules).
// Category stays disabled until a type is chosen and lists only that type's categories. Lists are maintained by
// an admin in the Types / Category dialogs, so these only pick. Renders two fields to sit inside a column's stack.
export function TypeCategoryFields({
  typeLabel, categoryLabel, types, categories, typeId, category, categoryBy, onChange,
  typeRequired, categoryRequired, typeEmptyHint, categoryEmptyHint,
}: TypeCategoryFieldsProps) {
  const value = (c: CategoryOption) => (categoryBy === 'name' ? c.name : String(c.id));
  const options = categories
    .filter((c) => String(c.type_id ?? '') === typeId)
    .map((c) => ({ id: value(c), name: c.name }));

  // Keep a saved category that is no longer listed (archived, or its type was removed)
  if (category && !options.some((o) => String(o.id) === category)) {
    const saved = categories.find((c) => value(c) === category);
    if (saved) options.push({ id: value(saved), name: saved.name });
    else if (categoryBy === 'name') options.push({ id: category, name: category });
  }

  return (
    <>
      <PickSelect
        label={typeLabel}
        required={typeRequired}
        placeholder="Select type"
        value={typeId}
        onChange={(id) => onChange({ typeId: id, category: '' })}
        options={types}
        emptyHint={typeEmptyHint ?? 'No types yet. An admin can add them.'}
      />
      <PickSelect
        label={categoryLabel}
        required={categoryRequired}
        placeholder="Select category"
        value={category}
        onChange={(c) => onChange({ typeId, category: c })}
        options={options}
        disabled={!typeId}
        emptyHint={categoryEmptyHint ?? 'No categories for this type yet. An admin can add them.'}
      />
    </>
  );
}
