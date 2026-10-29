import React, { useState } from 'react';
import { X, Activity, TrendingDown, TrendingUp, ShieldCheck, Target, Users, Package, Briefcase, RotateCcw, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PanelTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface ModuleIntelligencePanelProps {
  children: React.ReactNode;
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  className?: string;
  hasSelection?: boolean;
  tabs?: PanelTab[];
  // Overrides the default empty-state copy for this title (e.g. role-specific wording)
  emptyState?: { icon?: React.ReactNode; heading: string; body: string; tips: string[] };
}

const EMPTY_STATES: Record<string, { icon: React.ReactNode; heading: string; body: string; tips: string[] }> = {
  'Transaction Detail': {
    icon: <TrendingDown className="w-8 h-8 text-[var(--shell-accent)]/60" />,
    heading: 'No Transaction Selected',
    body: 'Select a row to view full transaction details, upload receipts, and post to ledger.',
    tips: ['Click any row to inspect', 'Upload receipts directly from the panel', 'Track fund allocation per project'],
  },
  'Approval Review': {
    icon: <ShieldCheck className="w-8 h-8 text-[var(--shell-accent)]/60" />,
    heading: 'No Request Selected',
    body: 'Select a pending approval to review submission details, receipt, and take action.',
    tips: ['Approve, reject, or send back from here', 'View split transaction breakdowns', 'Full audit trail per request'],
  },
  'Budget Details': {
    icon: <Target className="w-8 h-8 text-[var(--shell-accent)]/60" />,
    heading: 'No Budget Selected',
    body: 'Select a budget to view utilization, allocation details, and department spend.',
    tips: ['Monitor burn rate in real time', 'Compare allocated vs. spent', 'Drill into department allocations'],
  },
  'Client Details': {
    icon: <Users className="w-8 h-8 text-[var(--shell-accent)]/60" />,
    heading: 'No Client Selected',
    body: 'Select a client to view contact info, linked projects, and transaction activity.',
    tips: ['See projects and products per client', 'Track total spend and outstanding', 'Quick access to contact details'],
  },
  'User Profile': {
    icon: <Users className="w-8 h-8 text-[var(--shell-accent)]/60" />,
    heading: 'No User Selected',
    body: 'Select a team member to view their profile, role assignments, and active allocations.',
    tips: ['Manage project allocations', 'Set permissions and limits', 'View contact and location info'],
  },
  'Product Intelligence': {
    icon: <Package className="w-8 h-8 text-[var(--shell-accent)]/60" />,
    heading: 'No Product Selected',
    body: 'Select a product to view lifecycle stage, production metrics, and manage BOM.',
    tips: ['View quality and efficiency scores', 'Manage Bill of Materials', 'Schedule production runs'],
  },
  'Project Intelligence': {
    icon: <Briefcase className="w-8 h-8 text-[var(--shell-accent)]/60" />,
    heading: 'No Project Selected',
    body: 'Select a project to view health score, burn rate trends, and team assignments.',
    tips: ['Track budget utilization', 'Monitor timeline progress', 'View project team members'],
  },
  'Subscription Lifecycle': {
    icon: <RotateCcw className="w-8 h-8 text-[var(--shell-accent)]/60" />,
    heading: 'No Schedule Selected',
    body: 'Select a recurring schedule to view lifecycle, renewal terms, and run history.',
    tips: ['Pause or resume schedules', 'Review auto-renewal settings', 'Download full run reports'],
  },
};

export function ModuleIntelligencePanel({
  children,
  title,
  icon = <Activity className="h-3 w-3" />,
  onClose,
  className,
  hasSelection,
  tabs,
  emptyState,
}: ModuleIntelligencePanelProps) {
  const empty = emptyState ? { ...EMPTY_STATES[title], ...emptyState } : EMPTY_STATES[title];
  const [activeTab, setActiveTab] = useState<string>(() => tabs?.[0]?.id ?? '');

  const activeTabContent = tabs?.find(t => t.id === activeTab)?.content;

  return (
    <aside className={cn(
      "flex flex-col h-full w-full overflow-hidden",
      className
    )}>
      {/* Header */}
      <div className="h-10 px-5 dialog-header flex justify-between items-center shrink-0">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] mt-0.5 flex items-center gap-2">
          {icon}
          {title}
        </h3>
        <button
          onClick={onClose}
          className="rounded p-1 transition-colors"
          style={{ color: 'var(--shell-text-muted)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--shell-hover)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
          aria-label="Close panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tab bar — only when hasSelection and tabs provided */}
      {hasSelection && tabs && tabs.length > 0 && (
        <div className="flex px-4 gap-1 py-1.5 shrink-0 backdrop-blur-xl" style={{ borderBottom: '1px solid var(--shell-border)', background: 'var(--shell-surface)' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn("px-3 py-1 text-[12px] rounded-md transition-all")}
              style={activeTab === tab.id
                ? { background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)', fontWeight: 600 }
                : { color: 'var(--shell-text-muted)' }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar" style={{ background: 'var(--shell-bg)' }}>
        {hasSelection ? (
          tabs && tabs.length > 0 ? activeTabContent : children
        ) : (
          <div className="flex flex-col h-full">
            {/* Empty state */}
            <div className="flex flex-col items-center text-center pt-10 pb-6 px-4 gap-3">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'var(--shell-hover)' }}>
                {empty?.icon ?? <Activity className="w-8 h-8" style={{ color: 'var(--shell-text-muted)' }} />}
              </div>
              <div>
                <p className="text-[13px] font-semibold mt-1" style={{ color: 'var(--shell-text)' }}>{empty?.heading ?? 'Nothing selected'}</p>
                <p className="text-[12px] mt-1.5 leading-relaxed" style={{ color: 'var(--shell-text-muted)' }}>{empty?.body ?? 'Select a row to view details.'}</p>
              </div>
            </div>

            {/* Tips */}
            {empty?.tips && (
              <div className="mt-2 space-y-2 px-1">
                <p className="text-[11px] font-semibold uppercase tracking-widest px-1" style={{ color: 'var(--shell-text-muted)' }}>What you can do</p>
                {empty.tips.map((tip, i) => (
                  <div key={i} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5" style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
                    <ArrowRight className="w-3 h-3 shrink-0" style={{ color: 'var(--shell-text-muted)' }} />
                    <span className="text-[12px]" style={{ color: 'var(--shell-text)' }}>{tip}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
