// Deterministic deal filtering and sorting, shared by the Deals list and the planner.
import type { Deal } from './types';
import { dealStatus, valueOf, type Value } from './value';

export interface DealFilters {
  query: string;
  /** Your state (2-letter); null = don't filter by location. */
  state: string | null;
  noDd: boolean;
  noHardPull: boolean;
  online: boolean;
  noChexSensitive: boolean;
  business: 'hide' | 'include' | 'only';
  minBonus: number;
  /** Max direct deposit total you can route (null = any). */
  maxDd: number | null;
  /** Max cash you can park (null = any; 0 = no balance deals). */
  maxBalance: number | null;
  showEnded: boolean;
  showDatePassed: boolean;
}

export const DEFAULT_FILTERS: DealFilters = {
  query: '',
  state: null,
  noDd: false,
  noHardPull: false,
  online: false,
  noChexSensitive: false,
  business: 'hide',
  minBonus: 0,
  maxDd: null,
  maxBalance: null,
  showEnded: false,
  showDatePassed: true,
};

export type SortKey = 'value' | 'bonus' | 'ending' | 'effort' | 'apy' | 'rank';

export const SORT_LABELS: Record<SortKey, string> = {
  value: 'Best value',
  bonus: 'Biggest bonus',
  ending: 'Ending soonest',
  effort: 'Least effort',
  apy: 'Best return on parked cash',
  rank: 'Doctor of Credit order',
};

export function availableIn(d: Deal, state: string | null): boolean {
  return !state || d.nationwide || d.states.includes(state);
}

export function isBusiness(d: Deal): boolean {
  return d.category === 'business' || /business/i.test(d.title);
}

export function matches(d: Deal, f: DealFilters, today: string): boolean {
  const status = dealStatus(d, today);
  if (status === 'ended' && !f.showEnded) return false;
  if (status === 'date-passed' && !f.showDatePassed) return false;
  if (!availableIn(d, f.state)) return false;
  if (f.noDd && d.dd.required !== false) return false;
  if (f.noHardPull && d.pull === 'hard') return false;
  if (f.online && d.inBranch) return false;
  if (f.noChexSensitive && d.chexSensitive) return false;
  const biz = isBusiness(d);
  if (f.business === 'hide' && biz) return false;
  if (f.business === 'only' && !biz) return false;
  if ((d.bonusMax ?? 0) < f.minBonus) return false;
  if (f.maxDd != null && d.dd.required && (d.dd.amount ?? 0) > f.maxDd) return false;
  if (f.maxBalance != null && d.balance && d.balance.amount > f.maxBalance) return false;
  if (f.query.trim()) {
    const q = f.query.trim().toLowerCase();
    const hay = `${d.title} ${d.bank} ${d.availability ?? ''} ${d.promoCode ?? ''}`.toLowerCase();
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

export interface Ranked {
  deal: Deal;
  value: Value;
}

export function sortDeals(items: Ranked[], key: SortKey): Ranked[] {
  const by = (fn: (r: Ranked) => number) => (a: Ranked, b: Ranked) => fn(a) - fn(b) || a.deal.rank - b.deal.rank;
  const sorted = [...items];
  switch (key) {
    case 'value': return sorted.sort(by((r) => -r.value.net));
    case 'bonus': return sorted.sort(by((r) => -(r.deal.bonusMax ?? 0)));
    case 'ending': return sorted.sort((a, b) =>
      (a.deal.expires ?? '9999') .localeCompare(b.deal.expires ?? '9999') || a.deal.rank - b.deal.rank);
    case 'effort': return sorted.sort(by((r) => r.value.effort * 10_000 - r.value.net));
    case 'apy': return sorted.sort(by((r) => -(r.value.effectiveApy ?? -1)));
    case 'rank': return sorted.sort(by(() => 0));
  }
}

export function filterAndSort(deals: Deal[], f: DealFilters, key: SortKey, today: string, baselineApy: number): Ranked[] {
  const ranked = deals.filter((d) => matches(d, f, today)).map((deal) => ({ deal, value: valueOf(deal, baselineApy) }));
  return sortDeals(ranked, key);
}

/** How many non-default advanced filters are on, for the "More filters (2)" label. */
export function activeAdvancedCount(f: DealFilters): number {
  let n = 0;
  if (f.noChexSensitive) n++;
  if (f.business !== DEFAULT_FILTERS.business) n++;
  if (f.minBonus > 0) n++;
  if (f.maxDd != null) n++;
  if (f.maxBalance != null) n++;
  if (f.showEnded) n++;
  if (!f.showDatePassed) n++;
  return n;
}
