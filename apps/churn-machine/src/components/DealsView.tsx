import { useMemo, useState } from 'react';
import type { Deal } from '../lib/types';
import {
  activeAdvancedCount, DEFAULT_FILTERS, filterAndSort, SORT_LABELS, type DealFilters, type SortKey,
} from '../lib/filters';
import { usd, requirementSummary } from '../lib/value';
import { usePersisted } from '../lib/settings';
import { Check, Disclosure, MoneyInput, Segmented, StatusTag, VerdictTag } from './bits';
import { DealDetail } from './DealDetail';

const CATEGORY_LABEL: Record<Deal['category'], string> = {
  checking: 'Checking', savings: 'Savings', business: 'Business', state: 'Local', regional: 'Local', other: '',
};

export function DealsView({ deals, today, state, baselineApy, setBaselineApy, trackAction }: {
  deals: Deal[];
  today: string;
  state: string | null;
  baselineApy: number;
  setBaselineApy: (v: number) => void;
  /** Renders the "track" control for a deal (depends on sign-in state). */
  trackAction: (d: Deal) => React.ReactNode;
}) {
  const [stored, setFilters] = usePersisted<Omit<DealFilters, 'query' | 'state'>>('deal-filters', DEFAULT_FILTERS);
  const [sort, setSort] = usePersisted<SortKey>('deal-sort', 'value');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const filters: DealFilters = { ...DEFAULT_FILTERS, ...stored, query, state };
  const set = (patch: Partial<DealFilters>) => setFilters({ ...stored, ...patch });

  const shown = useMemo(
    () => filterAndSort(deals, filters, sort, today, baselineApy),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, JSON.stringify(filters), sort, today, baselineApy],
  );
  const advanced = activeAdvancedCount(filters);

  return (
    <>
      <div className="toolbar">
        <input
          className="input search"
          type="search"
          placeholder="Search banks"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="input" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          {Object.entries(SORT_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>
      <div className="toolbar">
        <div className="chips">
          <button type="button" className={`chip ${filters.noDd ? 'on' : ''}`} onClick={() => set({ noDd: !filters.noDd })}>No direct deposit</button>
          <button type="button" className={`chip ${filters.online ? 'on' : ''}`} onClick={() => set({ online: !filters.online })}>Online only</button>
          <button type="button" className={`chip ${filters.noHardPull ? 'on' : ''}`} onClick={() => set({ noHardPull: !filters.noHardPull })}>No hard pull</button>
          <button type="button" className={`chip ${filters.maxBalance === 0 ? 'on' : ''}`} onClick={() => set({ maxBalance: filters.maxBalance === 0 ? null : 0 })}>No parking cash</button>
        </div>
        <span className="grow" />
        <Disclosure label={`More filters${advanced ? ` (${advanced})` : ''}`}>
          <div className="panel" style={{ flexBasis: '100%' }}>
            <div className="form-grid">
              <label className="field">
                Business accounts
                <Segmented
                  ariaLabel="Business accounts"
                  value={filters.business}
                  onChange={(business) => set({ business })}
                  options={[{ value: 'hide', label: 'Hide' }, { value: 'include', label: 'Include' }, { value: 'only', label: 'Only' }]}
                />
              </label>
              <label className="field">
                Minimum bonus
                <MoneyInput ariaLabel="Minimum bonus" value={filters.minBonus || null} placeholder="0" onChange={(v) => set({ minBonus: v ?? 0 })} />
              </label>
              <label className="field">
                Most direct deposit I can route
                <MoneyInput ariaLabel="Max direct deposit" value={filters.maxDd} placeholder="Any" onChange={(v) => set({ maxDd: v })} />
                <span className="hint">Total the deal needs, over its window.</span>
              </label>
              <label className="field">
                Most cash I can park
                <MoneyInput ariaLabel="Max cash to park" value={filters.maxBalance} placeholder="Any" onChange={(v) => set({ maxBalance: v })} />
              </label>
              <label className="field">
                My savings APY (for “worth it”)
                <span className="money-input">
                  <input
                    className="input"
                    style={{ width: 80, paddingLeft: 10 }}
                    inputMode="decimal"
                    aria-label="Baseline savings APY percent"
                    defaultValue={(baselineApy * 100).toFixed(1)}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value);
                      if (Number.isFinite(n) && n >= 0 && n < 50) setBaselineApy(n / 100);
                    }}
                  />
                  <span style={{ position: 'static', marginLeft: 6 }}>%</span>
                </span>
                <span className="hint">What parked cash would earn elsewhere.</span>
              </label>
              <div className="field" style={{ gap: 8 }}>
                <Check checked={filters.noChexSensitive} onChange={(v) => set({ noChexSensitive: v })}>Skip ChexSystems-sensitive banks</Check>
                <Check checked={filters.showDatePassed} onChange={(v) => set({ showDatePassed: v })}>Show deals past their listed end date</Check>
                <Check checked={filters.showEnded} onChange={(v) => set({ showEnded: v })}>Show ended deals</Check>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn quiet small" onClick={() => setFilters(DEFAULT_FILTERS)}>Reset filters</button>
            </div>
          </div>
        </Disclosure>
      </div>

      <p className="meta" style={{ margin: '4px 2px 8px' }}>
        {shown.length} {shown.length === 1 ? 'deal' : 'deals'}
        {!state && ' · pick your state above to hide ones you can’t get'}
      </p>

      {shown.length === 0 ? (
        <div className="empty">Nothing matches. Try loosening a filter.</div>
      ) : (
        <div className="list">
          {shown.map(({ deal: d, value: v }) => {
            const open = openId === d.id;
            return (
              <div key={d.id} className={`row ${open ? 'open' : ''}`}>
                <button type="button" className="row-head" aria-expanded={open} onClick={() => setOpenId(open ? null : d.id)}>
                  <span className="row-title">
                    {d.bank} <span className="faint">{CATEGORY_LABEL[d.category]}</span>
                  </span>
                  <span className="row-amount">
                    {d.bonusMin != null && d.bonusMax != null && d.bonusMin < d.bonusMax && <span className="faint small">up to </span>}
                    {d.bonusMax != null ? usd(d.bonusMax) : '?'}
                  </span>
                  <span className="row-sub">{requirementSummary(d)}</span>
                  <span className="row-side">
                    <StatusTag deal={d} today={today} /> · <VerdictTag verdict={v.verdict} />
                  </span>
                </button>
                {open && <DealDetail deal={d} today={today} baselineApy={baselineApy} actions={trackAction(d)} />}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
