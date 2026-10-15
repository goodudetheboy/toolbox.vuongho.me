import { useMemo, useState } from 'react';
import type { Deal } from '../lib/types';
import {
  activeAdvancedCount, DEFAULT_FILTERS, filterAndSort, SORT_LABELS, type DealFilters, type SortKey,
} from '../lib/filters';
import { requirementSummary, usd } from '../lib/value';
import { usePersisted } from '../lib/settings';
import { BankPicker, Check, Disclosure, MoneyInput, Segmented, StatusTag, VerdictTag } from './bits';

const CATEGORY_LABEL: Record<Deal['category'], string> = {
  checking: 'CHK', savings: 'SAV', business: 'BIZ', state: 'LOCAL', regional: 'LOCAL', other: '',
};

export function DealsView({ deals, today, state, baselineApy, setBaselineApy, excludedBanks, setExcludedBanks, banks, onOpenDeal }: {
  deals: Deal[];
  today: string;
  state: string | null;
  baselineApy: number;
  setBaselineApy: (v: number) => void;
  excludedBanks: string[];
  setExcludedBanks: (v: string[]) => void;
  banks: string[];
  onOpenDeal: (d: Deal) => void;
}) {
  const [stored, setFilters] = usePersisted<Omit<DealFilters, 'query' | 'state'>>('deal-filters', DEFAULT_FILTERS);
  const [sort, setSort] = usePersisted<SortKey>('deal-sort', 'value');
  const [query, setQuery] = useState('');
  const [pickBanks, setPickBanks] = useState(false);
  const filters: DealFilters = { ...DEFAULT_FILTERS, ...stored, query, state, excludeBanks: excludedBanks };
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
          <button type="button" className={`chip ${excludedBanks.length ? 'on' : ''}`} aria-expanded={pickBanks} onClick={() => setPickBanks(!pickBanks)}>
            Banks I have{excludedBanks.length ? ` (${excludedBanks.length} hidden)` : ''} {pickBanks ? '▴' : '▾'}
          </button>
        </div>
        <span className="grow" />
        {pickBanks && (
          <div className="panel" style={{ flexBasis: '100%', order: 1 }}>
            <div className="field">
              Hide deals from banks you already have (or had)
              <BankPicker banks={banks} value={excludedBanks} onChange={setExcludedBanks} />
              <span className="hint">The planner skips these banks too.</span>
            </div>
          </div>
        )}
        <Disclosure label={`More filters${advanced ? ` (${advanced})` : ''}`}>
          <div className="panel" style={{ flexBasis: '100%', order: 2 }}>
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
        <div className="list deal-table">
          <div className="deal-row deal-cols" aria-hidden="true">
            <span>Bank</span>
            <span className="num">Bonus</span>
            <span className="num">Net</span>
            <span className="c-req">Requirements</span>
            <span className="c-status">Ends</span>
            <span className="c-grade">Grade</span>
          </div>
          {shown.map(({ deal: d, value: v }) => (
            <button key={d.id} type="button" className="deal-row" onClick={() => onOpenDeal(d)}>
              <span className="c-bank">
                {d.bank} <span className="cat">{CATEGORY_LABEL[d.category]}</span>
              </span>
              <span className="num c-bonus">
                {d.bonusMin != null && d.bonusMax != null && d.bonusMin < d.bonusMax && <span className="faint">≤</span>}
                {d.bonusMax != null ? usd(d.bonusMax) : '?'}
              </span>
              <span className={`num c-net ${v.net > 0 ? 'up' : 'down'}`}>{usd(v.net)}</span>
              <span className="c-req">{requirementSummary(d)}</span>
              <span className="c-status"><StatusTag deal={d} today={today} /></span>
              <span className="c-grade"><VerdictTag verdict={v.verdict} /></span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
