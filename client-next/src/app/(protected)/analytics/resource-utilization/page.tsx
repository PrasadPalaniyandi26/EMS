'use client';

import { useEffect, useState } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency, getDateRange } from '@/lib/currency';
import {
  useTopSpenders, useCategoryHeatmap, useProjectBurn, useProductBurn,
} from '@/hooks/use-queries';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Users, Flame, Briefcase, Package } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────
const DATE_PRESETS = [
  { label: 'This Month',      key: 'thisMonth' },
  { label: 'Last Month',      key: 'lastMonth' },
  { label: 'Calendar Year',   key: 'calYear' },
  { label: 'Financial Year',  key: 'finYear' },
];

const HEATMAP_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'];

function heatColor(val: number, max: number) {
  if (!val || !max) return 'var(--shell-hover)';
  const pct = val / max;
  if (pct >= 0.75) return 'rgba(239,68,68,0.75)';
  if (pct >= 0.50) return 'rgba(245,158,11,0.70)';
  if (pct >= 0.25) return 'rgba(59,130,246,0.60)';
  return 'rgba(59,130,246,0.25)';
}

function SkeletonRect({ h = '120px' }: { h?: string }) {
  return <div className="animate-pulse rounded-xl" style={{ height: h, background: 'var(--shell-hover)' }} />;
}

function CurrencyTooltip({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-[12px] shadow-lg border"
      style={{ background: 'var(--shell-surface)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }}>
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? fmt(p.value) : p.value}
        </p>
      ))}
    </div>
  );
}

function BurnList({ data, nameKey, fmt }: { data: any[]; nameKey: string; fmt: (n: number) => string }) {
  return (
    <div className="space-y-3">
      {data.map((p: any, i: number) => {
        const pct   = p.pct ?? null;
        const color = pct === null ? '#6b7280' : pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981';
        return (
          <div key={i}>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-[12px] font-medium truncate max-w-[55%]" style={{ color: 'var(--shell-text)' }}>{p[nameKey]}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px]" style={{ color: 'var(--shell-text-muted)' }}>{fmt(p.spent)}</span>
                {pct !== null && (
                  <span className="text-[11px] font-bold tabular-nums" style={{ color }}>{pct}%</span>
                )}
              </div>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--shell-hover)' }}>
              {p.budget > 0 ? (
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct ?? 0, 100)}%`, background: color }} />
              ) : (
                <div className="h-full rounded-full" style={{ width: '100%', background: 'var(--shell-border)' }} />
              )}
            </div>
            {p.budget > 0 && (
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--shell-text-muted)' }}>Budget: {fmt(p.budget)}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function SpendAnalyticsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const currency  = useAuthStore((s) => s.user?.currency || 'INR');
  const fmt       = (n: number) => formatCurrency(n, currency);

  useEffect(() => { setHeader('Spend Analytics', 'Real-time expense intelligence across users, projects & products'); }, [setHeader]);

  const [preset, setPreset]     = useState('Financial Year');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  useEffect(() => {
    const r = getDateRange('finYear');
    setDateFrom(r.from);
    setDateTo(r.to);
  }, []);

  const handlePreset = (label: string, key: string) => {
    setPreset(label);
    const r = getDateRange(key as any);
    setDateFrom(r.from);
    setDateTo(r.to);
  };

  const { data: spenders,    isLoading: loadSpenders  } = useTopSpenders(dateFrom, dateTo);
  const { data: heatmap,     isLoading: loadHeatmap   } = useCategoryHeatmap(dateFrom, dateTo);
  const { data: burnProject, isLoading: loadBurnProj  } = useProjectBurn(dateFrom, dateTo);
  const { data: burnProduct, isLoading: loadBurnProd  } = useProductBurn(dateFrom, dateTo);

  const surface   = { background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' };
  const axisStyle = { fontSize: 11, fill: 'var(--shell-text-muted)' };

  const heatMax = heatmap
    ? Math.max(...(heatmap.months || []).flatMap((m: any) =>
        (heatmap.categories || []).map((c: string) => m.values[c] || 0)
      ), 1)
    : 1;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">

      {/* Period selector */}
      <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-3" style={surface}>
        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESETS.map((p) => (
            <button key={p.label} onClick={() => handlePreset(p.label, p.key)}
              className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all"
              style={preset === p.label
                ? { background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)' }
                : { background: 'var(--shell-hover)', color: 'var(--shell-text-muted)' }
              }>{p.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <input type="date" value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPreset('Custom'); }}
            className="rounded-lg px-3 py-1.5 text-[12px] border outline-none"
            style={{ background: 'var(--shell-bg)', color: 'var(--shell-text)', borderColor: 'var(--shell-border)' }} />
          <span className="text-[11px]" style={{ color: 'var(--shell-text-muted)' }}>—</span>
          <input type="date" value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPreset('Custom'); }}
            className="rounded-lg px-3 py-1.5 text-[12px] border outline-none"
            style={{ background: 'var(--shell-bg)', color: 'var(--shell-text)', borderColor: 'var(--shell-border)' }} />
        </div>
      </div>

      {/* Row 1: Top Spenders + Category Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Top Spenders */}
        <div className="rounded-xl overflow-hidden" style={surface}>
          <div className="dialog-header px-4 py-2.5 flex items-center gap-2">
            <Users className="h-3.5 w-3.5" style={{ color: 'var(--shell-accent)' }} />
            Top Spenders
          </div>
          <div className="p-4">
            {loadSpenders ? <SkeletonRect h="220px" /> : !spenders?.length ? (
              <p className="text-center py-12 text-[12px] italic" style={{ color: 'var(--shell-text-muted)' }}>No expense data for this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={spenders} layout="vertical" margin={{ left: 0, right: 40, top: 4, bottom: 4 }}>
                  <XAxis type="number" tick={axisStyle} tickFormatter={(v) => fmt(v)} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="username" tick={axisStyle} width={90} axisLine={false} tickLine={false} />
                  <Tooltip content={<CurrencyTooltip fmt={fmt} />} />
                  <Bar dataKey="total" name="Expense" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {(spenders || []).map((_: any, i: number) => (
                      <Cell key={i} fill={HEATMAP_COLORS[i % HEATMAP_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Category Spend Heatmap */}
        <div className="rounded-xl overflow-hidden" style={surface}>
          <div className="dialog-header px-4 py-2.5 flex items-center gap-2">
            <Flame className="h-3.5 w-3.5" style={{ color: 'var(--shell-accent)' }} />
            Category Spend Heatmap
            <span className="text-[10px] ml-1" style={{ color: 'var(--shell-text-muted)' }}>— darker = higher spend</span>
          </div>
          <div className="p-4 overflow-x-auto">
            {loadHeatmap ? <SkeletonRect h="220px" /> : !heatmap?.categories?.length ? (
              <p className="text-center py-12 text-[12px] italic" style={{ color: 'var(--shell-text-muted)' }}>No expense data</p>
            ) : (
              <table className="w-full text-[11px] border-separate" style={{ borderSpacing: '3px' }}>
                <thead>
                  <tr>
                    <th className="text-left font-semibold pr-3 w-16" style={{ color: 'var(--shell-text-muted)' }}>Month</th>
                    {(heatmap.categories as string[]).map((c: string) => (
                      <th key={c} className="font-semibold text-center px-1 whitespace-nowrap" style={{ color: 'var(--shell-text-muted)' }}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(heatmap.months as any[]).map((m: any) => (
                    <tr key={m.label}>
                      <td className="pr-3 font-medium whitespace-nowrap" style={{ color: 'var(--shell-text-muted)' }}>{m.label}</td>
                      {(heatmap.categories as string[]).map((c: string) => {
                        const val = m.values[c] || 0;
                        return (
                          <td key={c} title={val ? fmt(val) : '—'}
                            className="rounded text-center font-semibold cursor-default transition-all"
                            style={{ background: heatColor(val, heatMax), color: val ? 'white' : 'var(--shell-text-muted)', padding: '5px 8px', fontSize: 10 }}>
                            {val ? (val >= 100000 ? `${(val / 1000).toFixed(0)}k` : val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val) : ''}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Project Burn + Product Burn */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Project Budget Burn */}
        <div className="rounded-xl overflow-hidden" style={surface}>
          <div className="dialog-header px-4 py-2.5 flex items-center gap-2">
            <Briefcase className="h-3.5 w-3.5" style={{ color: 'var(--shell-accent)' }} />
            Project Budget Burn
          </div>
          <div className="p-4">
            {loadBurnProj ? <SkeletonRect h="220px" /> : !burnProject?.length ? (
              <p className="text-center py-12 text-[12px] italic" style={{ color: 'var(--shell-text-muted)' }}>No project expense data</p>
            ) : (
              <BurnList data={burnProject} nameKey="project_name" fmt={fmt} />
            )}
          </div>
        </div>

        {/* Product Budget Burn */}
        <div className="rounded-xl overflow-hidden" style={surface}>
          <div className="dialog-header px-4 py-2.5 flex items-center gap-2">
            <Package className="h-3.5 w-3.5" style={{ color: 'var(--shell-accent)' }} />
            Product Budget Burn
          </div>
          <div className="p-4">
            {loadBurnProd ? <SkeletonRect h="220px" /> : !burnProduct?.length ? (
              <p className="text-center py-12 text-[12px] italic" style={{ color: 'var(--shell-text-muted)' }}>No product expense data</p>
            ) : (
              <BurnList data={burnProduct} nameKey="product_name" fmt={fmt} />
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
