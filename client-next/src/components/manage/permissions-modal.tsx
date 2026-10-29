'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { roleColor } from '@/lib/roles';
import { toast } from 'sonner';
import api from '@/lib/api-client';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { AutoLabel, CurrencyInput } from '@/components/shared/modal-primitives';

// ─── PermissionsModal ─────────────────────────────────────────────────────────

const MODULES = [
  { name: 'Dashboard & Analytics', category: 'Core' },
  { name: 'Expense Management', category: 'Finance' },
  { name: 'Income Tracking', category: 'Finance' },
  { name: 'Budgets & Forecasts', category: 'Finance' },
  { name: 'Client Database', category: 'Operations' },
  { name: 'Projects & Milestones', category: 'Operations' },
  { name: 'Products & BOM', category: 'Operations' },
  { name: 'Approvals & Workflow', category: 'Governance' },
  { name: 'Organization & Users', category: 'Governance' },
  { name: 'Reports & Audit', category: 'Governance' },
];

// Mirrors sidebar NAV_GROUPS structure
const MODULE_GROUPS = [
  {
    label: 'MAIN',
    color: 'var(--shell-text)',
    items: ['Dashboard & Analytics'],
  },
  {
    label: 'Transactions',
    color: 'var(--shell-text)',
    items: ['Approvals & Workflow', 'Expense Management', 'Income Tracking'],
  },
  {
    label: 'Operations',
    color: 'var(--shell-text)',
    items: ['Client Database', 'Projects & Milestones', 'Products & BOM'],
  },
  {
    label: 'Manage',
    color: 'var(--shell-text)',
    items: ['Organization & Users', 'Budgets & Forecasts'],
  },
  {
    label: 'Analytics',
    color: 'var(--shell-text)',
    items: ['Reports & Audit'],
  },
];

const PERMISSIONS = ['View', 'Create', 'Edit', 'Delete', 'Approve'];

const DEFAULT_PERMS: Record<string, boolean[]> = {
  'Dashboard & Analytics':    [true,  false, false, false, false],
  'Expense Management':       [true,  true,  true,  false, false],
  'Income Tracking':          [true,  true,  true,  false, false],
  'Budgets & Forecasts':      [true,  false, false, false, false],
  'Client Database':          [true,  false, false, false, false],
  'Projects & Milestones':    [true,  false, false, false, false],
  'Products & BOM':           [true,  false, false, false, false],
  'Approvals & Workflow':     [true,  false, false, false, false],
  'Organization & Users':     [false, false, false, false, false],
  'Reports & Audit':          [false, false, false, false, false],
};

type PermMap = Record<string, boolean[]>;

const ROLE_TEMPLATES: Record<string, PermMap> = {
  Employee: DEFAULT_PERMS,
  Manager: Object.fromEntries(MODULES.map((m) => [m.name, [true, true, true, false, true]])),
  Finance: Object.fromEntries(MODULES.map((m) => [m.name, m.category === 'Finance' ? [true, true, true, true, true] : [true, false, false, false, false]])),
  Admin: Object.fromEntries(MODULES.map((m) => [m.name, [true, true, true, true, true]])),
};

const CATEGORY_COLORS: Record<string, string> = {
  Core: 'text-[var(--shell-text)]', Finance: 'text-[var(--success)]', Operations: 'text-[var(--info)]', Governance: 'text-[var(--warning)]',
};

export function PermissionsModal({ isOpen, onClose, user }: { isOpen: boolean; onClose: () => void; user: any }) {
  const [perms, setPerms] = useState<PermMap>(() => JSON.parse(JSON.stringify(DEFAULT_PERMS)));
  const [template, setTemplate] = useState('Employee');
  const [thresholds, setThresholds] = useState({ single: '10000', monthly: '50000' });
  const [scope, setScope] = useState('Department');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && user?.id) {
      setPerms(JSON.parse(JSON.stringify(DEFAULT_PERMS)));
      setTemplate('Employee');
      // Load existing permissions
      api.get(`/users/${user.id}/permissions`).then((res) => {
        const d = res.data as any;
        if (d && d.permissions && Object.keys(d.permissions).length > 0) {
          setPerms(d.permissions);
          setTemplate('Custom');
          setThresholds({
            single: String(d.single_limit || 10000),
            monthly: String(d.monthly_limit || 50000),
          });
          setScope(d.data_scope || 'Department');
        }
      }).catch(() => {});
    }
  }, [isOpen, user]);

  const applyTemplate = (name: string) => {
    setTemplate(name);
    setPerms(JSON.parse(JSON.stringify(ROLE_TEMPLATES[name] || DEFAULT_PERMS)));
  };

  const togglePerm = (module: string, idx: number) => {
    setPerms((prev) => {
      const updated = [...(prev[module] || [false, false, false, false, false])];
      updated[idx] = !updated[idx];
      return { ...prev, [module]: updated };
    });
  };

  const toggleAllModule = (module: string) => {
    const current = perms[module] || [];
    const allOn = current.every(Boolean);
    setPerms((prev) => ({ ...prev, [module]: PERMISSIONS.map(() => !allOn) }));
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      await api.put(`/users/${user.id}/permissions`, {
        permissions: perms,
        single_limit: Number(thresholds.single.replace(/,/g, '')) || 10000,
        monthly_limit: Number(thresholds.monthly.replace(/,/g, '')) || 50000,
        data_scope: scope,
      });
      toast.success('Permissions saved. Audit log entry created.');
      onClose();
    } catch {
      toast.error('Failed to save permissions.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Permissions — ${user?.username || ''}`}
      icon={<ShieldCheck className="w-4 h-4" />}
      onSave={handleSave}
      saveLabel={saving ? 'Saving...' : 'Save Permissions'}
      size="xl"
      footerLeft={
        <div className="flex items-center gap-2 text-[var(--shell-text-muted)] text-[12px] font-semibold italic">
          <ShieldCheck className="w-3.5 h-3.5" />
          Audit log entry will be created on save.
        </div>
      }
    >
      <div className="flex gap-6">
        {/* Left: Matrix */}
        <div className="flex-1 min-w-0">
          {/* Role template selector */}
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[var(--shell-border)]">
            <span className="text-[12px] font-semibold text-[var(--shell-text-muted)] shrink-0">Apply Template:</span>
            <div className="flex gap-2 flex-wrap">
              {Object.keys(ROLE_TEMPLATES).map((t) => {
                const c = roleColor(t);
                return (
                  <button key={t} onClick={() => applyTemplate(t)}
                    className={cn('px-3 py-1 rounded-lg text-[12px] font-semibold border transition-all', template === t ? 'border-input bg-transparent text-[var(--shell-text)] border-[var(--shell-border)] text-[var(--shell-text)]' : 'text-[var(--shell-text-muted)] border-[var(--shell-border)] hover:text-[var(--shell-text)]')}
                    style={template !== t ? { background: 'var(--shell-bg)' } : {}}
                  >
                    <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle', c.dot)} />
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Permission matrix — sidebar-mirrored tree view */}
          <div className="overflow-x-auto rounded-lg">
          <div className="border border-[var(--shell-border)] rounded-lg overflow-hidden min-w-[480px]" style={{ background: 'var(--shell-surface)' }}>
            {/* Column header */}
            <div className="dialog-header flex items-center text-[12px] font-semibold">
              <div className="flex-1 px-4 py-3">Module</div>
              {PERMISSIONS.map((p) => (
                <div key={p} className="w-[70px] py-3 text-center shrink-0">{p}</div>
              ))}
              <div className="w-[56px] py-3 text-center shrink-0">All</div>
            </div>

            {MODULE_GROUPS.map((group, gi) => (
              <div key={group.label} className={gi > 0 ? 'border-t border-[var(--shell-border)]' : ''}>
                {/* Group label */}
                <div className="px-4 py-1.5 flex items-center gap-2" style={{ background: 'var(--shell-hover)' }}>
                  <span className="text-[12px] font-semibold" style={{ color: 'var(--shell-text)' }}>
                    {group.label}
                  </span>
                  <div className="h-px flex-1" style={{ background: 'var(--shell-border)' }} />
                </div>

                {/* Module rows */}
                {group.items.map((modName) => {
                  const modPerms = perms[modName] || [false, false, false, false, false];
                  const allOn = modPerms.every(Boolean);
                  return (
                    <div key={modName} className="flex items-center hover:rounded-lg border transition-colors border-t border-[var(--shell-border)] group">
                      <div className="flex-1 flex items-center gap-2 pl-7 pr-4 py-2.5 min-w-0">
                        <div className="w-px h-3 shrink-0" style={{ background: 'var(--shell-border)' }} />
                        <div className="w-3 h-px shrink-0" style={{ background: 'var(--shell-border)' }} />
                        <span className="text-[12px] font-semibold text-[var(--shell-text)] truncate">
                          {modName}
                        </span>
                      </div>
                      {modPerms.map((on, i) => (
                        <div key={i} className="w-[70px] py-2.5 flex items-center justify-center shrink-0">
                          <div
                            onClick={() => togglePerm(modName, i)}
                            className={cn('w-4 h-4 rounded-md border-2 flex items-center justify-center cursor-pointer transition-all',
                              on ? 'bg-[var(--shell-accent)] border-[var(--shell-accent)]' : 'border-[var(--shell-border)] hover:border-[var(--shell-accent)]/50')}
                            style={!on ? { background: 'var(--shell-bg)' } : {}}
                          >
                            {on && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                        </div>
                      ))}
                      <div className="w-[56px] py-2.5 flex items-center justify-center shrink-0">
                        <div
                          onClick={() => toggleAllModule(modName)}
                          className={cn('w-4 h-4 rounded-md border-2 flex items-center justify-center cursor-pointer transition-all',
                            allOn ? 'bg-[var(--warning)] border-[var(--warning)]' : 'border-[var(--shell-border)] hover:border-[color-mix(in_srgb,var(--warning)_50%,transparent)]')}
                          style={!allOn ? { background: 'var(--shell-bg)' } : {}}
                        >
                          {allOn && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          </div>
        </div>

        {/* Right: Config panel */}
        <div className="w-[220px] shrink-0 space-y-2.5">
          {/* Approval Thresholds */}
          <div className="border border-[var(--shell-border)] rounded-lg overflow-hidden" style={{ background: 'var(--shell-surface)' }}>
            <div className="dialog-header px-4 py-2.5">
              <span className="text-[12px] font-semibold">Approval Limits</span>
            </div>
            <div className="p-4 space-y-2.5">
              <div className="space-y-1">
                <AutoLabel className="text-xs font-medium text-[var(--shell-text)]">Single Transaction</AutoLabel>
                <CurrencyInput value={thresholds.single} onChange={(v) => setThresholds((p) => ({ ...p, single: v }))} />
              </div>
              <div className="space-y-1">
                <AutoLabel className="text-xs font-medium text-[var(--shell-text)]">Monthly Ceiling</AutoLabel>
                <CurrencyInput value={thresholds.monthly} onChange={(v) => setThresholds((p) => ({ ...p, monthly: v }))} />
              </div>
            </div>
          </div>

          {/* Data Scope */}
          <div className="border border-[var(--shell-border)] rounded-lg overflow-hidden" style={{ background: 'var(--shell-surface)' }}>
            <div className="dialog-header px-4 py-2.5">
              <span className="text-[12px] font-semibold">Data Visibility</span>
            </div>
            <div className="p-3 space-y-2">
              {['Own Records', 'Department', 'Global'].map((s) => (
                <button key={s} onClick={() => setScope(s)}
                  className={cn('w-full text-left px-3 py-2 rounded-lg text-[12px] font-semibold transition-all flex items-center gap-2',
                    scope === s ? 'bg-[var(--shell-accent)] text-[var(--shell-accent-fg)]' : 'text-[var(--shell-text-muted)] hover:text-[var(--shell-text)]')}
                  style={scope !== s ? { background: 'var(--shell-bg)' } : {}}
                >
                  <div className={cn('w-2 h-2 rounded-full shrink-0', scope === s ? 'bg-white' : 'bg-[var(--shell-border)]')} />
                  {s}
                </button>
              ))}
              <p className="text-[12px] text-[var(--shell-text-muted)] font-semibold leading-relaxed pt-1 italic">
                {scope === 'Own Records' && 'User sees only their own transactions and records.'}
                {scope === 'Department' && 'Access limited to their department branch.'}
                {scope === 'Global' && 'Full access across all departments and records.'}
              </p>
            </div>
          </div>

          {/* Summary */}
          <div className="border border-[var(--shell-border)] rounded-lg overflow-hidden" style={{ background: 'var(--shell-surface)' }}>
            <div className="dialog-header px-4 py-2.5">
              <span className="text-[12px] font-semibold">Summary</span>
            </div>
            <div className="p-4 space-y-2">
              {PERMISSIONS.map((p, i) => {
                const count = MODULES.filter((m) => perms[m.name]?.[i]).length;
                const pct = Math.round((count / MODULES.length) * 100);
                return (
                  <div key={p}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium text-[var(--shell-text-muted)]">{p}</span>
                      <span className="text-[12px] font-semibold text-[var(--shell-accent)]">{count}/{MODULES.length}</span>
                    </div>
                    <div className="w-full h-1 rounded-lg border bg-[var(--secondary)] rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--shell-accent)] rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </ModuleModal>
  );
}

