import { useMemo, useState } from 'react';
import type { Deal } from '../lib/types';
import {
  activeAdvancedCount, DEFAULT_FILTERS, filterAndSort, SORT_LABELS, type DealFilters, type SortKey,
} from '../lib/filters';
import { laterTotal, requirementSummary, usd } from '../lib/value';
import { usePersisted } from '../lib/settings';
import { STATE_NAMES } from '../lib/states';
import { Check, ExcludeBanks, MoneyInput, Segmented, StatusTag, VerdictTag, type Exclusion } from './bits';

const CATEGORY_LABEL: Record<Deal['category'], string> = {
  checking: 'Checking', savings: 'Savings', business: 'Business', state: 'Local', regional: 'Local', other: '',
};

export function DealsView({ deals, today, state, baselineApy, setBaselineApy, exclusion, onOpenDeal }: {
  deals: Deal[];
  today: string;
  state: string | null;
  baselineApy: number;
  setBaselineApy: (v: number) => void;
  exclusion: Exclusion;
  onOpenDeal: (d: Deal) => void;
}) {
  const [stored, setFilters] = usePersisted<Omit<DealFilters, 'query' | 'state'>>('deal-filters', DEFAULT_FILTERS);
  const [sort, setSort] = usePersisted<SortKey>('deal-sort', 'value');
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filters: DealFilters = { ...DEFAULT_FILTERS, ...stored, query, state, excludeBanks: exclusion.effective };
  const set = (patch: Partial<DealFilters>) => setFilters({ ...stored, ...patch });

  const shown = useMemo(
    () => filterAndSort(deals, filters, sort, today, baselineApy),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, JSON.stringify(filters), sort, today, baselineApy],
  );
  const advanced = activeAdvancedCount(filters) + (exclusion.effective.length ? 1 : 0);

  return (
    <>
      <div className="page-head">
        <h1>Deals</h1>
        <p className="muted">
          {shown.length} bank {shown.length === 1 ? 'bonus' : 'bonuses'}
          {state ? ` you can get in ${STATE_NAMES[state] ?? state}` : ' · pick your state up top to hide ones you can’t get'}
        </p>
      </div>
      {filtersOpen && <div className="filters-backdrop" onClick={() => setFiltersOpen(false)} />}
      <div className="layout">
        <aside className={`layout-side filters-side ${filtersOpen ? 'open' : ''}`}>
          <div className="filters-sheet-head">
            <span>Filters</span>
            <button type="button" className="btn primary small" onClick={() => setFiltersOpen(false)}>Show {shown.length} deals</button>
          </div>
          <div className="card">
            <h3>Banks</h3>
            <ExcludeBanks x={exclusion} />
          </div>
          <div className="card">
            <h3 className="desktop-only">Filters</h3>
            <div className="stack">
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
                My savings APY
                <span className="money-input suffix">
                  <input
                    className="input"
                    inputMode="decimal"
                    aria-label="Baseline savings APY percent"
                    defaultValue={(baselineApy * 100).toFixed(1)}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value);
                      if (Number.isFinite(n) && n >= 0 && n < 50) setBaselineApy(n / 100);
                    }}
                  />
                  <span>%</span>
                </span>
                <span className="hint">What parked cash would earn elsewhere. Used for “net”.</span>
              </label>
              <Check checked={filters.noChexSensitive} onChange={(v) => set({ noChexSensitive: v })}>Skip ChexSystems-sensitive banks</Check>
              <Check checked={filters.showDatePassed} onChange={(v) => set({ showDatePassed: v })}>Show deals past their listed end date</Check>
              <Check checked={filters.showEnded} onChange={(v) => set({ showEnded: v })}>Show ended deals</Check>
              <button type="button" className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setFilters(DEFAULT_FILTERS)}>Reset filters</button>
            </div>
          </div>
        </aside>

        <div className="layout-main">

          <input className="input search" type="search" placeholder="Search banks" value={query} onChange={(e) => setQuery(e.target.value)} />

          <div className="chips scroll">
            <button type="button" className={`chip filters-toggle ${filtersOpen ? 'on' : ''}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>
              Filters{advanced ? ` · ${advanced}` : ''}
            </button>
            <button type="button" className={`chip ${filters.noDd ? 'on' : ''}`} onClick={() => set({ noDd: !filters.noDd })}>No direct deposit</button>
            <button type="button" className={`chip ${filters.online ? 'on' : ''}`} onClick={() => set({ online: !filters.online })}>Online only</button>
            <button type="button" className={`chip ${filters.noHardPull ? 'on' : ''}`} onClick={() => set({ noHardPull: !filters.noHardPull })}>No hard pull</button>
            <button type="button" className={`chip ${filters.maxBalance === 0 ? 'on' : ''}`} onClick={() => set({ maxBalance: filters.maxBalance === 0 ? null : 0 })}>No parking cash</button>
          </div>

  
          <section className="section">
            <div className="list-head">
              <h2>All deals</h2>
              <select className="input select-quiet" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {Object.entries(SORT_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>
            {shown.length === 0 ? (
              <div className="empty">Nothing matches. Try loosening a filter.</div>
            ) : (
              <div className="items">
                {shown.map(({ deal: d, value: v }) => (
                  <button key={d.id} type="button" className="item" onClick={() => onOpenDeal(d)}>
                    <span className="item-main">
                      <span className="item-name">
                        {d.bank}
                        {CATEGORY_LABEL[d.category] && <span className="badge">{CATEGORY_LABEL[d.category]}</span>}
                      </span>
                      <span className="item-sub">{requirementSummary(d)}</span>
                      <span className="item-meta">
                        <StatusTag deal={d} today={today} /> · <VerdictTag verdict={v.verdict} />
                        {laterTotal(d) > 0 && <span className="later-note"> · +{usd(laterTotal(d))} later, not counted</span>}
                      </span>
                    </span>
                    <span className="item-side">
                      <span className="pill">
                        {d.bonusMin != null && d.bonusMax != null && d.bonusMin < d.bonusMax && <span className="pill-pre">up to </span>}
                        {d.bonusMax != null ? usd(d.bonusMax) : '?'}
                      </span>
                      <span className={`item-net ${v.net > 0 ? '' : 'down'}`}>{usd(v.net)} net</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
