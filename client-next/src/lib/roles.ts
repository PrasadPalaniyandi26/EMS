// Role colours. Two files each kept their own copy (and disagreed: Finance was indigo in one and
// emerald elsewhere). Colours come from the --role-* tokens, which are AA-safe in both themes.
// The class strings are written out in full so Tailwind can see them.
const ROLE_STYLES: Record<string, { label: string; dot: string; text: string; badge: string }> = {
  admin: {
    label: 'Admin',
    dot: 'bg-[var(--role-admin)]',
    text: 'text-[var(--role-admin)]',
    badge: 'bg-[color-mix(in_srgb,var(--role-admin)_12%,transparent)] text-[var(--role-admin)] border-[color-mix(in_srgb,var(--role-admin)_30%,transparent)]',
  },
  finance: {
    label: 'Finance',
    dot: 'bg-[var(--role-finance)]',
    text: 'text-[var(--role-finance)]',
    badge: 'bg-[color-mix(in_srgb,var(--role-finance)_12%,transparent)] text-[var(--role-finance)] border-[color-mix(in_srgb,var(--role-finance)_30%,transparent)]',
  },
  manager: {
    label: 'Manager',
    dot: 'bg-[var(--role-manager)]',
    text: 'text-[var(--role-manager)]',
    badge: 'bg-[color-mix(in_srgb,var(--role-manager)_12%,transparent)] text-[var(--role-manager)] border-[color-mix(in_srgb,var(--role-manager)_30%,transparent)]',
  },
  employee: {
    label: 'Employee',
    dot: 'bg-[var(--role-employee)]',
    text: 'text-[var(--role-employee)]',
    badge: 'bg-[color-mix(in_srgb,var(--role-employee)_12%,transparent)] text-[var(--role-employee)] border-[color-mix(in_srgb,var(--role-employee)_30%,transparent)]',
  },
};

const FALLBACK = {
  label: '',
  dot: 'bg-[var(--shell-text-muted)]',
  text: 'text-[var(--shell-text-muted)]',
  badge: 'bg-[var(--shell-hover)] text-[var(--shell-text-muted)] border-[var(--shell-border)]',
};

export function getRoleStyle(roleName?: string | null) {
  const key = (roleName || '').toLowerCase();
  return ROLE_STYLES[key] || { ...FALLBACK, label: roleName || '—' };
}
