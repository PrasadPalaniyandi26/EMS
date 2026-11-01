'use client';

import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { ChartFrame } from '@/components/shared/chart-frame';
import type { Evm } from '@/hooks/use-planning-queries';
import { money } from '@/components/budgets/budget-ui';
import { cn } from '@/lib/utils';

type Line = { tone: 'ok' | 'warn' | 'bad' | 'muted'; text: string };

const TONE: Record<Line['tone'], string> = {
  ok: 'text-[var(--success)]',
  warn: 'text-[var(--warning)]',
  bad: 'text-[var(--danger)]',
  muted: 'text-[var(--shell-text-muted)]',
};

// The three questions earned value answers, in plain words: is the work on schedule, is the spend in step with it, and where does it end
function verdict(e: Evm, currency: string): Line[] {
  const m = (v: number) => money(v, currency);
  const out: Line[] = [];
  if (e.spi == null) out.push({ tone: 'muted', text: 'No milestone is planned yet, so the schedule cannot be judged.' });
  else if (e.spi < 0.95) out.push({ tone: 'warn', text: `Behind schedule: ${e.percent_complete}% done against ${e.percent_planned}% planned.` });
  else if (e.spi > 1.05) out.push({ tone: 'ok', text: `Ahead of schedule: ${e.percent_complete}% done against ${e.percent_planned}% planned.` });
  else out.push({ tone: 'ok', text: `On schedule: ${e.percent_complete}% done, ${e.percent_planned}% planned.` });

  if (e.spend_low) out.push({ tone: 'warn', text: `Spend looks incomplete: the work done is worth ${m(e.ev)} but only ${m(e.ac)} is booked${e.last_spend ? `, latest in ${e.last_spend}` : ''}.` });
  else if (e.cpi == null) out.push({ tone: 'muted', text: e.ac > 0 ? 'No work is done yet, so cost cannot be judged.' : 'No spend is booked yet, so cost cannot be judged.' });
  else if (e.cpi >= 1) out.push({ tone: 'ok', text: `Within budget for the work done: ${m(e.ac)} spent for ${m(e.ev)} earned.` });
  else if (e.cpi >= 0.9) out.push({ tone: 'warn', text: `Slightly over for the work done: ${m(e.ac)} spent for ${m(e.ev)} earned.` });
  else out.push({ tone: 'bad', text: `Over budget for the work done: ${m(e.ac)} spent for ${m(e.ev)} earned.` });

  if (e.spend_low) out.push({ tone: 'muted', text: `No forecast yet: the budget of ${m(e.bac)} is shown until spend catches up with progress.` });
  else if (e.vac < 0) out.push({ tone: 'bad', text: `Forecast ${m(e.eac)} overruns the budget of ${m(e.bac)} by ${m(-e.vac)}.` });
  else out.push({ tone: 'ok', text: `Forecast ${m(e.eac)} against a budget of ${m(e.bac)}.` });
  return out;
}

// Verdict in words, then planned, earned and actual cost month by month against the budget
export function EvmModal({ isOpen, onClose, evm, currency }: { isOpen: boolean; onClose: () => void; evm: Evm; currency: string }) {
  const compact = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const axis = { fontSize: 12, fill: 'var(--shell-text-muted)' };
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="xl" title="Planned, earned and actual cost" icon={<TrendingUp className="h-4 w-4" />}
      footer={<Button onClick={onClose} className="h-8 px-5 text-[12px] font-semibold">Close</Button>}>
      <div className="space-y-3">
      <ul className="space-y-1" aria-label="Where the project stands">
        {verdict(evm, currency).map((l) => <li key={l.text} className={cn('text-[13px]', TONE[l.tone])}>{l.text}</li>)}
      </ul>
      {evm.series.length > 1 ? (
        <ChartFrame label="Planned value, earned value and actual cost by month" columns={['Month', 'Planned', 'Earned', 'Actual']}
          rows={evm.series.map((s) => [s.label, money(s.pv, currency), s.ev == null ? '' : money(s.ev, currency), s.ac == null ? '' : money(s.ac, currency)])}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={evm.series} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--shell-border)" strokeOpacity={0.5} />
              <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
              <YAxis tick={axis} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => compact.format(Number(v))} />
              <Tooltip formatter={(v) => money(typeof v === 'number' ? v : 0, currency)} contentStyle={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)', borderRadius: 8, fontSize: 12, color: 'var(--shell-text)' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--shell-text-muted)' }} />
              <ReferenceLine y={evm.bac} stroke="var(--shell-accent)" strokeDasharray="4 4" label={{ value: 'Budget', position: 'insideBottomLeft', fontSize: 12, fill: 'var(--shell-accent)' }} />
              <Line type="monotone" dataKey="pv" name="Planned" stroke="var(--shell-text-muted)" strokeDasharray="5 4" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="ev" name="Earned" stroke="var(--success)" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="ac" name="Actual" stroke="var(--info)" strokeWidth={2} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      ) : (
        <p className="text-[12px] text-[var(--shell-text-muted)]">Add milestones with planned dates to see the curve.</p>
      )}
      </div>
    </ModuleModal>
  );
}
