import { useEffect, useMemo, useState } from 'react';
import type { Deal } from '../lib/types';
import {
  buildStrategies, OBJECTIVES, sortStrategies, STRATEGY_SORTS, type PlanInputs, type Strategy, type StrategySort,
} from '../lib/planner';
import { addDays, monthLabel, nextWeekday, shortDate } from '../lib/dates';
import { compactUsd, usd } from '../lib/value';
import { usePersisted } from '../lib/settings';
import { Check, Disclosure, MoneyInput, Segmented } from './bits';
import { DealDetail } from './DealDetail';

type StoredInputs = Omit<PlanInputs, 'state' | 'excludeBanks'> & { skipTracked: boolean };

function defaults(today: string): StoredInputs {
  return {
    paycheck: 2500,
    firstPayday: nextWeekday(today, 5),
    months: 6,
    cash: 0,
    maxSplits: 3,
    leadDays: 7,
    minBonus: 100,
    noHardPull: true,
    noChexSensitive: false,
    online: true,
    business: false,
    includeDatePassed: false,
    skipTracked: true,
  };
}

/** A saved payday in the past rolls forward in 2-week steps. */
function rollForward(payday: string, today: string): string {
  let d = payday;
  while (d < today) d = addDays(d, 14);
  return d;
}

export function PlanView({ deals, today, state, baselineApy, trackedBanks, signedIn, onSave }: {
  deals: Deal[];
  today: string;
  state: string | null;
  baselineApy: number;
  trackedBanks: string[];
  signedIn: boolean;
  onSave: (s: Strategy, inputs: PlanInputs) => Promise<void>;
}) {
  const [stored, setStored] = usePersisted<StoredInputs>('plan-inputs', defaults(today));
  const [sort, setSort] = usePersisted<StrategySort>('plan-sort', 'net');
  const [maxAccounts, setMaxAccounts] = usePersisted<number>('plan-max-accounts', 0);
  const [openId, setOpenId] = useState<string | null>(null);
  const set = (patch: Partial<StoredInputs>) => setStored({ ...stored, ...patch });

  const inputs: PlanInputs = {
    ...stored,
    firstPayday: rollForward(stored.firstPayday, today),
    state,
    excludeBanks: stored.skipTracked ? trackedBanks : [],
  };
  const key = JSON.stringify(inputs);
  const strategies = useMemo(
    () => buildStrategies(deals, inputs, today, baselineApy),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, key, today, baselineApy],
  );
  const shown = sortStrategies(strategies, sort).filter((s) => !maxAccounts || s.totals.accounts <= maxAccounts);
  useEffect(() => setOpenId(null), [key]);

  return (
    <>
      <div className="panel">
        <div className="form-grid">
          <label className="field">
            Paycheck, every 2 weeks
            <MoneyInput ariaLabel="Paycheck amount" value={stored.paycheck} onChange={(v) => set({ paycheck: v ?? 0 })} />
            <span className="hint">Take-home amount that can be routed.</span>
          </label>
          <label className="field">
            Next payday
            <input className="input" type="date" value={inputs.firstPayday} min={today} onChange={(e) => e.target.value && set({ firstPayday: e.target.value })} />
          </label>
          <label className="field">
            Plan for
            <Segmented
              ariaLabel="Plan length"
              value={stored.months}
              onChange={(months) => set({ months })}
              options={[3, 6, 9, 12].map((m) => ({ value: m, label: `${m} mo` }))}
            />
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <Disclosure label="Tune the plan">
            <div className="form-grid" style={{ marginTop: 12 }}>
              <label className="field">
                Cash I can park
                <MoneyInput ariaLabel="Cash to park" value={stored.cash} onChange={(v) => set({ cash: v ?? 0 })} />
                <span className="hint">Unlocks savings / balance bonuses.</span>
              </label>
              <label className="field">
                Split a paycheck across up to
                <Segmented ariaLabel="Max splits" value={stored.maxSplits} onChange={(maxSplits) => set({ maxSplits })}
                  options={[1, 2, 3, 4].map((n) => ({ value: n, label: `${n}` }))} />
                <span className="hint">Accounts per paycheck your payroll allows.</span>
              </label>
              <label className="field">
                Open accounts ahead of payday by
                <Segmented ariaLabel="Lead days" value={stored.leadDays} onChange={(leadDays) => set({ leadDays })}
                  options={[3, 7, 14].map((n) => ({ value: n, label: `${n} days` }))} />
                <span className="hint">Time to switch your direct deposit.</span>
              </label>
              <label className="field">
                Skip bonuses under
                <MoneyInput ariaLabel="Minimum bonus" value={stored.minBonus} onChange={(v) => set({ minBonus: v ?? 0 })} />
              </label>
              <div className="field" style={{ gap: 8 }}>
                <Check checked={stored.noHardPull} onChange={(noHardPull) => set({ noHardPull })}>Avoid hard credit pulls</Check>
                <Check checked={stored.online} onChange={(online) => set({ online })}>Online only (no branch visits)</Check>
                <Check checked={stored.noChexSensitive} onChange={(noChexSensitive) => set({ noChexSensitive })}>Skip ChexSystems-sensitive banks</Check>
              </div>
              <div className="field" style={{ gap: 8 }}>
                <Check checked={stored.business} onChange={(business) => set({ business })}>Include business accounts</Check>
                <Check checked={stored.includeDatePassed} onChange={(includeDatePassed) => set({ includeDatePassed })}>Include deals past their listed end date</Check>
                {signedIn && (
                  <Check checked={stored.skipTracked} onChange={(skipTracked) => set({ skipTracked })}>Skip banks I already track</Check>
                )}
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <button type="button" className="btn quiet small" onClick={() => setStored(defaults(today))}>Reset</button>
            </div>
          </Disclosure>
        </div>
      </div>

      <div className="toolbar">
        <span className="meta grow">
          {shown.length ? `${shown.length} ${shown.length === 1 ? 'way' : 'ways'} to do it${state ? '' : ' (all states; pick yours above)'}` : ''}
        </span>
        <select className="input" aria-label="Max accounts" value={maxAccounts} onChange={(e) => setMaxAccounts(Number(e.target.value))}>
          <option value={0}>Any number of accounts</option>
          {[4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>Up to {n} accounts</option>)}
        </select>
        <select className="input" aria-label="Sort plans" value={sort} onChange={(e) => setSort(e.target.value as StrategySort)}>
          {Object.entries(STRATEGY_SORTS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>

      {shown.length === 0 ? (
        <div className="empty">No plan fits. Try a longer plan, a bigger paycheck, more cash to park, or fewer restrictions.</div>
      ) : (
        <div className="list">
          {shown.map((s) => {
            const open = openId === s.id;
            return (
              <div key={s.id} className={`row strategy ${open ? 'open' : ''}`}>
                <button type="button" className="row-head" aria-expanded={open} onClick={() => setOpenId(open ? null : s.id)}>
                  <span className="row-title">{s.name}</span>
                  <span className="row-amount">{usd(s.totals.net)}</span>
                  <span className="row-sub">
                    {s.totals.accounts} accounts · first bonus ~{s.totals.firstPayout ? shortDate(s.totals.firstPayout, today) : '–'}
                    {s.totals.peakParked > 0 && ` · parks up to ${compactUsd(s.totals.peakParked)}`}
                  </span>
                  <span className="row-side meta">{OBJECTIVES[s.objective].hint}</span>
                </button>
                {open && (
                  <StrategyDetail strategy={s} today={today} baselineApy={baselineApy} signedIn={signedIn} onSave={() => onSave(s, inputs)} />
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="meta" style={{ marginTop: 10 }}>
        Plans are a starting point built from parsed deal terms. Anything marked “assumed” wasn’t in the post; check the Doctor of Credit post for each bank before opening.
      </p>
    </>
  );
}

function StrategyDetail({ strategy: s, today, baselineApy, signedIn, onSave }: {
  strategy: Strategy;
  today: string;
  baselineApy: number;
  signedIn: boolean;
  onSave: () => Promise<void>;
}) {
  const [view, setView] = useState<'accounts' | 'paychecks'>('accounts');
  const [dealOpen, setDealOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const months = [...new Set(s.items.map((i) => i.openOn.slice(0, 7)))];

  return (
    <div className="detail">
      <div className="toolbar" style={{ marginTop: 6 }}>
        <div className="stat-line grow">
          <span><b>{usd(s.totals.bonus)}</b> in bonuses</span>
          <span><b>{s.totals.accounts}</b> accounts</span>
          {s.totals.lastPayout && <span>last bonus ~<b>{shortDate(s.totals.lastPayout, today)}</b></span>}
        </div>
        <Segmented ariaLabel="View" value={view} onChange={setView}
          options={[{ value: 'accounts', label: 'By account' }, { value: 'paychecks', label: 'By paycheck' }]} />
      </div>

      {view === 'accounts' ? months.map((m) => (
        <div key={m}>
          <div className="month">{monthLabel(`${m}-01`)}</div>
          <ul className="timeline">
            {s.items.filter((i) => i.openOn.startsWith(m)).map((i) => (
              <li key={i.deal.id}>
                <span className="when">{i.openOn === today ? 'Today' : shortDate(i.openOn, today)}</span>
                <div className="what">
                  <div>
                    Open <button type="button" className="more" style={{ color: 'var(--ink)', fontSize: 15 }} onClick={() => setDealOpen(dealOpen === i.deal.id ? null : i.deal.id)}>
                      <b>{i.deal.bank}</b>
                    </button>{' '}
                    · {usd(i.value.bonus)}
                  </div>
                  {i.deposits.length > 0 && (
                    <div className="small">Route {i.deposits.map((d) => `${usd(d.amount)} on ${shortDate(d.date, today)}`).join(', ')}</div>
                  )}
                  {i.park && <div className="small">Park {usd(i.park.amount)} until {shortDate(i.park.until, today)}</div>}
                  {i.transactionsBy && <div className="small">Make {i.deal.transactions} transactions by {shortDate(i.transactionsBy, today)}</div>}
                  {i.deal.promoCode && <div className="small">Promo code <span className="code">{i.deal.promoCode}</span></div>}
                  <div className="meta">Bonus ~{shortDate(i.expectedPayout, today)} · keep open until {shortDate(i.closeAfter, today)}</div>
                  {i.assumed.length > 0 && <div className="assume">Assumed: {i.assumed.join('; ')}</div>}
                  {dealOpen === i.deal.id && <DealDetail deal={i.deal} today={today} baselineApy={baselineApy} />}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )) : (
        <ul className="timeline" style={{ marginTop: 10 }}>
          {s.paychecks.map((p) => (
            <li key={p.date}>
              <span className="when">{shortDate(p.date, today)}</span>
              <div className="splits">
                {p.splits.map((x) => <span key={x.dealId}>{usd(x.amount)} → <b>{x.bank}</b></span>)}
                {(p.toMain > 0 || !p.splits.length) && (
                  <span className="to-main">{p.splits.length ? `rest (${usd(p.toMain)}) → your main account` : 'All to your main account'}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="links">
        <span className="meta grow">
          {signedIn ? 'Saving adds these accounts to My accounts as “planned”.' : 'Sign in to save this plan and track it.'}
        </span>
        <button
          type="button"
          className="btn primary"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave();
            } finally {
              setSaving(false);
            }
          }}
        >
          {signedIn ? (saving ? 'Saving…' : 'Use this plan') : 'Sign in to use this plan'}
        </button>
      </div>
    </div>
  );
}
