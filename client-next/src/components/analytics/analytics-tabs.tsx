'use client';

import { Panel } from '@/components/shared/panel';
import { RecordLink } from '@/components/budgets/budget-ui';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency, formatDate } from '@/lib/currency';
import {
  useOrderDelivery, usePartPrices, useProjectProfitability, useReceivables, useSpendingByPerson,
  type ProjectMarginRow,
} from '@/hooks/use-analytics';
import { Cell, DataGrid, EMPTY_NOTE, Kpis, PairBars, PanelSkeleton, Sparkline, TONE_TEXT, compact, pct, signedPct, type Tone } from './analytics-kit';

const useMoney = () => {
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  return (v: number | null | undefined) => (v == null ? '–' : formatCurrency(v, currency));
};
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

// ── Projects ───────────────────────────────────────────────────────────────

const STATE_TONE: Record<ProjectMarginRow['state'], Tone> = { 'Below minimum': 'danger', 'Below target': 'warning', 'On target': 'success', 'No price or estimate': 'muted' };

export function ProjectsTab() {
  const money = useMoney();
  const { data, isLoading } = useProjectProfitability();
  const t = data?.totals;
  return (
    <div className="space-y-6">
      {t && (
        <Kpis items={[
          { label: 'Projects priced', value: `${t.priced} of ${t.projects}` },
          { label: 'Contract value', value: money(t.contract_value) },
          { label: 'Estimated cost', value: money(t.estimate_total) },
          { label: 'Margin at estimate', value: pct(t.margin_pct), tone: t.margin_pct != null && t.margin_pct < 0 ? 'danger' : 'normal', hint: t.priced ? `${money(t.profit)} profit` : undefined },
          { label: 'Below minimum', value: t.below_minimum, tone: t.below_minimum ? 'danger' : 'muted' },
          { label: 'Below target', value: t.below_target, tone: t.below_target ? 'warning' : 'muted' },
        ]} />
      )}
      <Panel title="Margin by project">
        {isLoading ? <PanelSkeleton h={160} /> : !data?.rows.length ? (
          <p className={EMPTY_NOTE}>No projects yet. Add a project and an estimate to see its margin.</p>
        ) : (
          <DataGrid caption="Contract value, estimate and margin for each project, lowest margin first" columns={[
            { label: 'Project' }, { label: 'Contract value', right: true }, { label: 'Estimate', right: true }, { label: 'Margin', right: true },
            { label: 'Spent of estimate', right: true }, { label: 'Invoiced', right: true }, { label: 'Status' },
          ]}>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <Cell strong>
                  <RecordLink href={`/business/projects/${r.id}`}>{r.code ? `${r.code} ${r.name}` : r.name}</RecordLink>
                  {r.client_name && <p className="text-[12px] font-normal text-[var(--shell-text-muted)]">{r.client_name}</p>}
                </Cell>
                <Cell right>{money(r.contract_value)}</Cell>
                <Cell right>{money(r.estimate_total)}</Cell>
                <Cell right strong tone={r.state === 'Below minimum' ? 'danger' : r.state === 'Below target' ? 'warning' : 'normal'}>
                  {pct(r.margin_pct)}
                  {r.target_margin_pct != null && <span className="block text-[12px] font-normal text-[var(--shell-text-muted)]">target {r.target_margin_pct}%</span>}
                </Cell>
                <Cell right tone={r.spent_pct != null && r.spent_pct > 100 ? 'danger' : 'normal'}>{r.spent_pct == null ? '–' : `${pct(r.spent_pct, 0)}`}</Cell>
                <Cell right>{r.invoiced_pct != null ? pct(r.invoiced_pct, 0) : r.invoiced > 0 ? money(r.invoiced) : '–'}</Cell>
                <Cell tone={STATE_TONE[r.state]}>{r.state}</Cell>
              </tr>
            ))}
          </DataGrid>
        )}
      </Panel>
      <p className="text-[12px] text-[var(--shell-text-muted)]">Margin is the contract value less the estimate, as a share of the contract value. Spent counts approved expenses charged to the project. Invoiced is the share of the contract value billed.</p>
    </div>
  );
}

// ── Orders ─────────────────────────────────────────────────────────────────

export function OrdersTab() {
  const { data, isLoading } = useOrderDelivery();
  const k = data?.kpis;
  return (
    <div className="space-y-6">
      {k && (
        <Kpis items={[
          { label: 'Delivered', value: k.delivered },
          { label: 'On time', value: pct(k.on_time_pct, 0), tone: k.on_time_pct == null ? 'muted' : k.on_time_pct >= 90 ? 'success' : k.on_time_pct >= 70 ? 'warning' : 'danger', hint: k.delivered ? `${k.on_time} of ${k.delivered}` : undefined },
          { label: 'Average days late', value: k.avg_days_late == null ? '–' : k.avg_days_late.toFixed(1), tone: k.avg_days_late ? 'warning' : 'muted', hint: 'Orders delivered late' },
          { label: 'Open orders', value: k.open },
          { label: 'At risk', value: k.at_risk, tone: k.at_risk ? 'danger' : 'muted' },
        ]} />
      )}
      <Panel title="Delivered by month">
        {isLoading ? <PanelSkeleton h={200} /> : !k?.delivered ? (
          <p className={EMPTY_NOTE}>No order has been delivered yet. Once orders are delivered, this shows how many arrived on time and how many late.</p>
        ) : (
          <PairBars data={data!.months.map((m) => ({ label: m.label, a: m.on_time, b: m.late }))} a={{ label: 'On time', tone: 'success' }} b={{ label: 'Late', tone: 'danger' }} format={(v) => `${v} order${v === 1 ? '' : 's'}`} />
        )}
      </Panel>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Orders at risk">
          {isLoading ? <PanelSkeleton /> : !data?.at_risk.length ? (
            <p className={EMPTY_NOTE}>No open order is late or at risk of missing its promised date.</p>
          ) : (
            <DataGrid caption="Open orders that are past, or cannot make, the promised date" columns={[{ label: 'Order' }, { label: 'Promised', right: true }, { label: 'Why' }]}>
              {data.at_risk.map((r) => (
                <tr key={r.id}>
                  <Cell strong>
                    <RecordLink href={`/business/orders/${r.id}?tab=timeline`}>{r.code}</RecordLink>
                    <p className="text-[12px] font-normal text-[var(--shell-text-muted)]">{[r.client_name, r.product_name].filter(Boolean).join(' · ')}</p>
                  </Cell>
                  <Cell right>{formatDate(r.delivery_date)}</Cell>
                  <Cell tone="danger">{r.reason}, {days(r.days)}</Cell>
                </tr>
              ))}
            </DataGrid>
          )}
        </Panel>
        <Panel title="By product">
          {isLoading ? <PanelSkeleton /> : !data?.products.length ? (
            <p className={EMPTY_NOTE}>No orders yet.</p>
          ) : (
            <DataGrid caption="Delivered, late, open and at-risk orders for each product" columns={[{ label: 'Product' }, { label: 'Delivered', right: true }, { label: 'Late', right: true }, { label: 'Open', right: true }, { label: 'At risk', right: true }]}>
              {data.products.map((p) => (
                <tr key={p.product_name}>
                  <Cell strong>{p.product_name}</Cell>
                  <Cell right>{p.delivered}</Cell>
                  <Cell right tone={p.late ? 'danger' : 'muted'}>{p.late || '–'}</Cell>
                  <Cell right>{p.open || '–'}</Cell>
                  <Cell right tone={p.at_risk ? 'danger' : 'muted'}>{p.at_risk || '–'}</Cell>
                </tr>
              ))}
            </DataGrid>
          )}
        </Panel>
      </div>
      <p className="text-[12px] text-[var(--shell-text-muted)]">An order is late when it was delivered after its promised date. An open order is at risk when the promised date has passed, or when its parts and build cannot be ready by then (see its Build timeline).</p>
    </div>
  );
}

// ── People ─────────────────────────────────────────────────────────────────

export function PeopleTab({ from, to }: { from: string; to: string }) {
  const money = useMoney();
  const { data, isLoading } = useSpendingByPerson(from, to);
  const t = data?.totals;
  const max = Math.max(1, ...(data?.people ?? []).map((p) => p.total));
  return (
    <div className="space-y-6">
      {t && (
        <Kpis items={[
          { label: 'People spending', value: t.people },
          { label: 'Total spend', value: money(t.total) },
          { label: 'Waiting for approval', value: money(t.waiting), tone: t.waiting > 0 ? 'warning' : 'muted' },
          { label: 'Expenses', value: t.count },
        ]} />
      )}
      <Panel title="Spend by person">
        {isLoading ? <PanelSkeleton h={160} /> : !data?.people.length ? (
          <p className={EMPTY_NOTE}>No expenses in this period. Pick a longer period to see who spent what.</p>
        ) : (
          <DataGrid caption="Spend for each person, with what is still waiting for approval" columns={[
            { label: 'Person' }, { label: 'Department' }, { label: 'Approved', right: true }, { label: 'Waiting', right: true }, { label: 'Expenses', right: true },
            { label: 'Average', right: true }, { label: 'Largest', right: true }, { label: 'Share', width: '160px' },
          ]}>
            {data.people.map((p) => (
              <tr key={p.user_id}>
                <Cell strong>{p.username}</Cell>
                <Cell tone="muted">{p.department}</Cell>
                <Cell right>{money(p.approved)}</Cell>
                <Cell right tone={p.waiting > 0 ? 'warning' : 'muted'}>{p.waiting > 0 ? money(p.waiting) : '–'}</Cell>
                <Cell right>{p.count}</Cell>
                <Cell right>{money(p.average)}</Cell>
                <Cell right>{money(p.largest)}</Cell>
                <Cell>
                  <div className="flex items-center gap-2">
                    <div aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-md bg-[var(--shell-hover)]"><div className="h-full rounded-md" style={{ width: `${(p.total / max) * 100}%`, background: 'var(--chart-1)' }} /></div>
                    <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-[var(--shell-text-muted)]">{Math.round(p.share_pct)}%</span>
                  </div>
                </Cell>
              </tr>
            ))}
          </DataGrid>
        )}
      </Panel>
      {!!data?.departments.length && data.departments.length > 1 && (
        <Panel title="Spend by department">
          <DataGrid caption="Spend for each department" columns={[{ label: 'Department' }, { label: 'People', right: true }, { label: 'Total', right: true }, { label: 'Waiting', right: true }]}>
            {data.departments.map((d) => (
              <tr key={d.department}>
                <Cell strong>{d.department}</Cell>
                <Cell right>{d.people}</Cell>
                <Cell right>{money(d.total)}</Cell>
                <Cell right tone={d.waiting > 0 ? 'warning' : 'muted'}>{d.waiting > 0 ? money(d.waiting) : '–'}</Cell>
              </tr>
            ))}
          </DataGrid>
        </Panel>
      )}
      <p className="text-[12px] text-[var(--shell-text-muted)]">Counts approved expenses and those waiting for approval, for the people you can see. A manager sees their own team.</p>
    </div>
  );
}

// ── Receivables ────────────────────────────────────────────────────────────

const BUCKET_TONE: Record<string, string> = { 'Not Due': 'var(--success)', '1-30 Days': 'var(--chart-2)', '31-60 Days': 'var(--warning)', '61-90 Days': 'var(--chart-4)', 'Over 90 Days': 'var(--danger)' };

export function ReceivablesTab() {
  const money = useMoney();
  const { data, isLoading } = useReceivables();
  const total = data?.outstanding ?? 0;
  return (
    <div className="space-y-6">
      {data && (
        <Kpis items={[
          { label: 'Clients owe you', value: money(data.outstanding) },
          { label: 'Overdue', value: money(data.overdue), tone: data.overdue > 0 ? 'danger' : 'muted', hint: total > 0 ? `${pct((data.overdue / total) * 100, 0)} of what is owed` : undefined },
          { label: 'Unpaid invoices', value: data.invoices },
        ]} />
      )}
      <Panel title="How old what is owed is">
        {isLoading ? <PanelSkeleton h={100} /> : total <= 0 ? (
          <p className={EMPTY_NOTE}>No unpaid invoices. Issue an invoice from Clients and it will show here until it is paid.</p>
        ) : (
          <div className="space-y-4 p-4">
            <div role="img" aria-label={`Owed by age: ${data!.buckets.map((b) => `${b.label} ${money(b.amount)}`).join(', ')}`} className="flex h-4 overflow-hidden rounded-md bg-[var(--shell-hover)]">
              {data!.buckets.filter((b) => b.amount > 0).map((b) => <div key={b.label} style={{ width: `${(b.amount / total) * 100}%`, background: BUCKET_TONE[b.label] }} />)}
            </div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {data!.buckets.map((b) => (
                <div key={b.label}>
                  <dt className="flex items-center gap-1.5 text-[12px] text-[var(--shell-text-muted)]"><span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: BUCKET_TONE[b.label] }} />{b.label.replace(' Days', ' days').replace('Not Due', 'Not due')}</dt>
                  <dd className="mt-0.5 text-[14px] font-semibold tabular-nums">{money(b.amount)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Panel>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Who owes most">
          {isLoading ? <PanelSkeleton /> : !data?.clients.length ? <p className={EMPTY_NOTE}>Nothing is owed.</p> : (
            <DataGrid caption="Clients with unpaid invoices, largest first" columns={[{ label: 'Client' }, { label: 'Invoices', right: true }, { label: 'Owed', right: true }, { label: 'Overdue', right: true }, { label: 'Oldest' }]}>
              {data.clients.map((c) => (
                <tr key={c.client}>
                  <Cell strong>{c.client}</Cell>
                  <Cell right>{c.invoices}</Cell>
                  <Cell right>{money(c.outstanding)}</Cell>
                  <Cell right tone={c.overdue > 0 ? 'danger' : 'muted'}>{c.overdue > 0 ? money(c.overdue) : '–'}</Cell>
                  <Cell tone={c.oldest_bucket === 'Not due' ? 'muted' : c.oldest_bucket === 'Over 90 days' ? 'danger' : 'warning'}>{c.oldest_bucket}</Cell>
                </tr>
              ))}
            </DataGrid>
          )}
        </Panel>
        <Panel title="Billed and received">
          {isLoading ? <PanelSkeleton h={200} /> : !data?.monthly.some((m) => m.billed || m.received) ? (
            <p className={EMPTY_NOTE}>No invoices or payments in the last 12 months.</p>
          ) : (
            <PairBars data={data.monthly.map((m) => ({ label: m.label, a: m.billed, b: m.received }))} a={{ label: 'Billed', tone: 'muted' }} b={{ label: 'Received', tone: 'success' }} format={(v) => (v ? compact(v) : '0')} />
          )}
        </Panel>
      </div>
      <p className="text-[12px] text-[var(--shell-text-muted)]">Counted from the due date, as of today. Tax a client deducts (TDS) counts as received. The Receivables Ageing report has the same figures by invoice.</p>
    </div>
  );
}

// ── Part prices ────────────────────────────────────────────────────────────

export function PartPricesTab({ from, to }: { from: string; to: string }) {
  const money = useMoney();
  const { data, isLoading } = usePartPrices(from, to);
  const t = data?.totals;
  // A price that went up costs more, so a rise is the warning and a fall the good news
  const moveTone = (v: number | null): Tone => (v == null || Math.abs(v) < 0.5 ? 'muted' : v > 0 ? 'warning' : 'success');
  return (
    <div className="space-y-6">
      {t && (
        <Kpis items={[
          { label: 'Parts bought', value: t.parts },
          { label: 'Prices rising', value: t.up, tone: t.up ? 'warning' : 'muted' },
          { label: 'Prices falling', value: t.down, tone: t.down ? 'success' : 'muted' },
          { label: 'Average change', value: signedPct(t.avg_change_pct), tone: moveTone(t.avg_change_pct) },
          { label: 'Above standard', value: t.above_standard, tone: t.above_standard ? 'warning' : 'muted', hint: 'Last price over the standard' },
        ]} />
      )}
      <Panel title="Price movement by part">
        {isLoading ? <PanelSkeleton h={160} /> : !data?.rows.length ? (
          <p className={EMPTY_NOTE}>No purchase prices recorded in this period. Record a price on the Part master and its movement shows here.</p>
        ) : (
          <DataGrid caption="First and latest price paid for each part, with the change and the trend" columns={[
            { label: 'Part' }, { label: 'Supplier' }, { label: 'Purchases', right: true }, { label: 'First price', right: true }, { label: 'Latest price', right: true },
            { label: 'Change', right: true }, { label: 'Against standard', right: true }, { label: 'Trend' },
          ]}>
            {data.rows.map((r) => (
              <tr key={r.item_id}>
                <Cell strong>{r.part_no}<p className="text-[12px] font-normal text-[var(--shell-text-muted)]">{r.name}</p></Cell>
                <Cell tone="muted">{r.supplier ?? '–'}</Cell>
                <Cell right>{r.purchases}</Cell>
                <Cell right>{money(r.first_price)}</Cell>
                <Cell right strong>{money(r.latest_price)}</Cell>
                <Cell right tone={moveTone(r.change_pct)}>{signedPct(r.change_pct)}</Cell>
                <Cell right tone={moveTone(r.vs_standard_pct)}>{signedPct(r.vs_standard_pct)}</Cell>
                <Cell><span className={TONE_TEXT[moveTone(r.change_pct)]}><Sparkline points={r.series.map((s) => s.price)} tone={moveTone(r.change_pct) as Exclude<Tone, 'normal'>} /></span></Cell>
              </tr>
            ))}
          </DataGrid>
        )}
      </Panel>
      <p className="text-[12px] text-[var(--shell-text-muted)]">Change compares the first and the latest price paid in the period. Against standard compares the latest price with the standard price used in BOMs. A rise means the same part now costs more.</p>
    </div>
  );
}
