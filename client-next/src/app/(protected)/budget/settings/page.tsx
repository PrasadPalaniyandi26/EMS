'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import api from '@/lib/api-client';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useCategoryTypes, useInvalidate, QUERY_KEYS } from '@/hooks/use-queries';
import { sortByCode } from '@/lib/codes';
import { useBudgetSettings, MONTH_NAMES, type BudgetSettings } from '@/hooks/use-budget-queries';
import { Field, NativeSelect, CurrencyInput, SegmentedControl, inp } from '@/components/shared/modal-primitives';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-[var(--shell-border)] px-6 py-5 md:grid-cols-[240px_1fr]">
      <div>
        <h2 className="text-[15px] font-semibold text-[var(--shell-text)]">{title}</h2>
        {hint && <p className="mt-1 text-[12px] text-[var(--shell-text-muted)]">{hint}</p>}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

const KINDS = [
  { key: 'PROJECT', label: 'Project' },
  { key: 'PRODUCT', label: 'Product' },
  { key: 'OVERHEAD', label: 'Overhead' },
] as const;

export default function BudgetSettingsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const role = (useAuthStore((s) => s.user?.role_name) || '').toUpperCase();
  const isAdmin = role === 'ADMIN';
  const invalidate = useInvalidate();
  const { data } = useBudgetSettings();
  const { data: types } = useCategoryTypes('expense');
  const [form, setForm] = useState<BudgetSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setHeader('Budget settings', 'Financial year, control rules and alerts'); }, [setHeader]);
  useEffect(() => { if (data) setForm(structuredClone(data)); }, [data]);

  const set = <K extends keyof BudgetSettings>(k: K, v: BudgetSettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const dirty = !!form && !!data && JSON.stringify(form) !== JSON.stringify(data);
  const valid = !!form && Number(form.approval_threshold) >= 0 && Number(form.contingency_pct) >= 0 && Number(form.contingency_pct) <= 100;

  const save = async () => {
    if (!form || saving) return;
    setSaving(true);
    try {
      await api.put('/budgets/settings', {
        fy_start_month: form.fy_start_month, over_budget_mode: form.over_budget_mode, control_level: form.control_level,
        net_of_claimable_gst: form.net_of_claimable_gst, approval_threshold: Number(form.approval_threshold), contingency_pct: Number(form.contingency_pct),
        rules: form.rules.map((r) => ({ code: r.code, enabled: r.enabled, threshold: r.threshold })),
      });
      toast.success('Budget settings saved.');
      invalidate('budgets');
    } catch (err: any) {
      toast.error(err?.message || 'Could not save the settings.');
    } finally {
      setSaving(false);
    }
  };

  const toggleKind = async (typeId: number, name: string, code: string | null | undefined, current: string[] | null | undefined, kind: string) => {
    const set = new Set(current?.length ? current : KINDS.map((k) => k.key));
    if (set.has(kind)) set.delete(kind); else set.add(kind);
    if (set.size === 0) { toast.error('A type must be allowed for at least one cost object.'); return; }
    try {
      await api.put(`/category-types/${typeId}`, { name, code, applies_to: [...set] });
      invalidate(QUERY_KEYS.CATEGORY_TYPES);
    } catch (err: any) {
      toast.error(err?.message || 'Could not update the type.');
    }
  };

  if (!form) return <div className="p-6 text-[13px] text-[var(--shell-text-muted)]">Loading…</div>;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--shell-surface)]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--shell-border)] px-6">
        <p className="text-[13px] text-[var(--shell-text-muted)]">{dirty ? 'You have unsaved changes.' : 'Changes apply to new expenses straight away.'}</p>
        <button className="btn-action btn-action-primary" onClick={save} disabled={!dirty || !valid || saving}><Save className="h-4 w-4" /> Save settings</button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <Section title="Financial year" hint="Budget plans follow this year. It cannot change once a plan exists.">
          <Field label="Year starts in" hint={form.has_plans ? 'A plan already exists, so this is fixed.' : undefined}>
            <NativeSelect value={form.fy_start_month} disabled={form.has_plans} onChange={(e) => set('fy_start_month', Number(e.target.value))} className="max-w-[220px]">
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </NativeSelect>
          </Field>
        </Section>

        <Section title="Control" hint="How tightly spending is held to the budget lines.">
          <div className="space-y-1.5">
            <p id="bs-over" className="text-[13px] font-medium text-[var(--shell-text)]">When an expense would go over its budget</p>
            <SegmentedControl
              labelledBy="bs-over" value={form.over_budget_mode} onChange={(v) => set('over_budget_mode', v)} className="max-w-[420px]"
              options={[{ value: 'WARN' as const, label: 'Allow with a reason' }, { value: 'BLOCK' as const, label: 'Block it' }]}
            />
            <p className="text-[12px] text-[var(--shell-text-muted)]">Lines marked strict always block, whatever you choose here.</p>
          </div>
          <div className="space-y-1.5">
            <p id="bs-level" className="text-[13px] font-medium text-[var(--shell-text)]">Default control level for new lines</p>
            <SegmentedControl
              labelledBy="bs-level" value={form.control_level} onChange={(v) => set('control_level', v)} className="max-w-[420px]"
              options={[{ value: 'TYPE' as const, label: 'Expense type (E200)' }, { value: 'CATEGORY' as const, label: 'Category (E201)' }]}
            />
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-[var(--shell-text)]">
            <Switch className="mt-0.5" checked={form.net_of_claimable_gst} onCheckedChange={(v) => set('net_of_claimable_gst', v)} aria-label="Budget net of claimable GST" />
            <span>Budget net of claimable GST<span className="block text-[12px] text-[var(--shell-text-muted)]">Only the cost to the company counts against a line; GST you can claim back is left out.</span></span>
          </label>
          <div className="grid max-w-[460px] grid-cols-2 gap-4">
            <Field label="Approval threshold" hint="Over-budget amounts above this will need an Admin once approval routing is added.">
              <CurrencyInput value={String(form.approval_threshold)} onChange={(v) => set('approval_threshold', Number(v))} />
            </Field>
            <Field label="Contingency for new projects" hint="A starting point, in percent of the estimate.">
              <Input type="number" min="0" max="100" step="0.5" className={`${inp} border-input bg-transparent text-[var(--shell-text)]`} value={form.contingency_pct} onChange={(e) => set('contingency_pct', Number(e.target.value))} />
            </Field>
          </div>
        </Section>

        <Section title="Alert rules" hint="Each rule opens one alert per line and closes it when the condition clears.">
          <ul className="divide-y divide-[var(--shell-border)] rounded-lg border border-[var(--shell-border)]">
            {form.rules.map((r, i) => (
              <li key={r.code} className="flex items-center gap-3 px-4 py-3">
                <Switch checked={r.enabled} onCheckedChange={(v) => set('rules', form.rules.map((x, j) => (j === i ? { ...x, enabled: v } : x)))} aria-label={`${r.name} on`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-[var(--shell-text)]">{r.name}</p>
                  <p className="text-[12px] text-[var(--shell-text-muted)]">{r.detail}</p>
                </div>
                {r.threshold != null && (
                  <label className="flex items-center gap-2 text-[12px] text-[var(--shell-text-muted)]">
                    {r.code === 'UTILISATION' ? 'Caution at %' : r.code === 'UNDER_USE' ? 'Under %' : 'Days'}
                    <Input
                      type="number" min="1" step="1" aria-label={`${r.name} threshold`}
                      className={`${inp} border-input bg-transparent text-right tabular-nums !h-8 !w-20 text-[var(--shell-text)]`}
                      value={r.threshold} onChange={(e) => set('rules', form.rules.map((x, j) => (j === i ? { ...x, threshold: Number(e.target.value) } : x)))}
                    />
                  </label>
                )}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Where each expense type may be used" hint="Enforced when an expense is entered and when a budget line is added. Only an admin changes it.">
          <div className="overflow-hidden rounded-lg border border-[var(--shell-border)]">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[var(--table-header)] text-left text-[12px] font-semibold text-[var(--shell-text-muted)]">
                  <th className="px-4 py-2">Expense type</th>
                  {KINDS.map((k) => <th key={k.key} className="w-24 px-2 py-2 text-center">{k.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {sortByCode(types ?? []).filter((t) => t.code).map((t) => (
                  <tr key={t.id} className="border-t border-[var(--shell-border)]">
                    <td className="px-4 py-2 text-[var(--shell-text)]">{t.code} {t.name}</td>
                    {KINDS.map((k) => {
                      const on = !t.applies_to?.length || t.applies_to.includes(k.key);
                      return (
                        <td key={k.key} className="px-2 py-2 text-center">
                          <Switch checked={on} disabled={!isAdmin} onCheckedChange={() => toggleKind(t.id, t.name, t.code, t.applies_to, k.key)} aria-label={`${t.name} allowed for ${k.label}`} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!(types ?? []).some((t) => t.code) && <tr><td colSpan={4} className="px-4 py-4 text-[var(--shell-text-muted)]">No coded expense types yet. Load them with the code list or add codes in the Category dialog.</td></tr>}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}
