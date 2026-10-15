import { useEffect, useMemo, useState } from 'react';
import type { Deal } from '../lib/types';
import {
  buildStrategies, OBJECTIVES, sortStrategies, STRATEGY_SORTS, type PlanInputs, type Strategy, type StrategySort,
} from '../lib/planner';
import { addDays, monthLabel, nextWeekday, shortDate } from '../lib/dates';
import { compactUsd, usd } from '../lib/value';
import { usePersisted } from '../lib/settings';
import { Check, Disclosure, ExcludeBanks, MoneyInput, Segmented, type Exclusion } from './bits';
import { cumulative, PayoutChart, Sparkline, type PayoutPoint } from './PayoutChart';

type StoredInputs = Omit<PlanInputs, 'state' | 'excludeBanks'>;

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
  };
}

/** A saved payday in the past rolls forward in 2-week steps. */
function rollForward(payday: string, today: string): string {
  let d = payday;
  while (d < today) d = addDays(d, 14);
  return d;
}

export function PlanView({
  deals, today, state, baselineApy, exclusion, onOpenDeal, signedIn, onSave,
}: {
  deals: Deal[];
  today: string;
  state: string | null;
  baselineApy: number;
  exclusion: Exclusion;
  onOpenDeal: (d: Deal) => void;
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
    excludeBanks: exclusion.effective,
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
      <div className="page-head">
        <h1>Plan</h1>
        <p className="muted">
          {shown.length
            ? `${shown.length} ${shown.length === 1 ? 'way' : 'ways'} to earn with a ${usd(stored.paycheck)} paycheck${state ? '' : ' (all states; pick yours up top)'}`
            : 'Tell us about your paycheck and we’ll lay out which accounts to open when.'}
        </p>
      </div>
      <div className="layout">
        <aside className="layout-side">
          <div className="card order-card">
            <h3>Build your plan</h3>
            <div className="order-rows">
              <label className="order-row">
                <span>Paycheck <span className="faint">every 2 weeks</span></span>
                <MoneyInput ariaLabel="Paycheck amount" value={stored.paycheck} onChange={(v) => set({ paycheck: v ?? 0 })} />
              </label>
              <label className="order-row">
                <span>Next payday</span>
                <input className="input" type="date" value={inputs.firstPayday} min={today} onChange={(e) => e.target.value && set({ firstPayday: e.target.value })} />
              </label>
              <div className="order-row">
                <span>Plan for</span>
                <Segmented
                  ariaLabel="Plan length"
                  value={stored.months}
                  onChange={(months) => set({ months })}
                  options={[3, 6, 9, 12].map((m) => ({ value: m, label: `${m} mo` }))}
                />
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <Disclosure label={`More options${exclusion.effective.length ? ` · ${exclusion.effective.length} ${exclusion.effective.length === 1 ? 'bank' : 'banks'} excluded` : ''}`}>
                <div className="stack" style={{ marginTop: 12 }}>
                  <ExcludeBanks x={exclusion} />
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
                  <Check checked={stored.noHardPull} onChange={(noHardPull) => set({ noHardPull })}>Avoid hard credit pulls</Check>
                  <Check checked={stored.online} onChange={(online) => set({ online })}>Online only (no branch visits)</Check>
                  <Check checked={stored.noChexSensitive} onChange={(noChexSensitive) => set({ noChexSensitive })}>Skip ChexSystems-sensitive banks</Check>
                  <Check checked={stored.business} onChange={(business) => set({ business })}>Include business accounts</Check>
                  <Check checked={stored.includeDatePassed} onChange={(includeDatePassed) => set({ includeDatePassed })}>Include deals past their listed end date</Check>
                  <button type="button" className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setStored(defaults(today))}>Reset</button>
                </div>
              </Disclosure>
            </div>
          </div>
        </aside>

        <div className="layout-main">

          <div className="list-head">
            <h2>Strategies</h2>
            <span className="list-head-controls">
              <select className="input select-quiet" aria-label="Max accounts" value={maxAccounts} onChange={(e) => setMaxAccounts(Number(e.target.value))}>
                <option value={0}>Any number of accounts</option>
                {[4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>Up to {n} accounts</option>)}
              </select>
              <select className="input select-quiet" aria-label="Sort plans" value={sort} onChange={(e) => setSort(e.target.value as StrategySort)}>
                {Object.entries(STRATEGY_SORTS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </span>
          </div>

          {shown.length === 0 ? (
            <div className="empty">No plan fits. Try a longer plan, a bigger paycheck, more cash to park, or fewer restrictions.</div>
          ) : (
            <div className="items">
              {shown.map((s) => {
                const open = openId === s.id;
                return (
                  <div key={s.id} className={`strategy ${open ? 'open' : ''}`}>
                    <button type="button" className="item" aria-expanded={open} onClick={() => setOpenId(open ? null : s.id)}>
                      <span className="item-main">
                        <span className="item-name">{s.name}</span>
                        <span className="item-sub">
                          {s.totals.accounts} accounts · first bonus ~{s.totals.firstPayout ? shortDate(s.totals.firstPayout, today) : '–'}
                          {s.totals.peakParked > 0 && ` · parks up to ${compactUsd(s.totals.peakParked)}`}
                        </span>
                        <span className="item-meta">{OBJECTIVES[s.objective].hint}</span>
                      </span>
                      <Sparkline points={payoutPoints(s)} start={today} />
                      <span className="item-side">
                        <span className="pill">{usd(s.totals.net)}</span>
                        <span className="item-net">net</span>
                      </span>
                    </button>
                    {open && (
                      <StrategyDetail strategy={s} today={today} signedIn={signedIn} onOpenDeal={onOpenDeal} onSave={() => onSave(s, inputs)} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="footnote">
            Plans are a starting point built from parsed deal terms. Anything marked “assumed” wasn’t in the post; check the Doctor of Credit post for each bank before opening.
          </p>
        </div>
      </div>
    </>
  );
}

const payoutPoints = (s: Strategy): PayoutPoint[] =>
  s.items.map((i) => ({ date: i.expectedPayout, amount: i.value.bonus, label: i.deal.bank }));

function StrategyDetail({ strategy: s, today, signedIn, onOpenDeal, onSave }: {
  strategy: Strategy;
  today: string;
  signedIn: boolean;
  onOpenDeal: (d: Deal) => void;
  onSave: () => Promise<void>;
}) {
  const [view, setView] = useState<'accounts' | 'paychecks'>('accounts');
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const months = [...new Set(s.items.map((i) => i.openOn.slice(0, 7)))];
  const points = payoutPoints(s);
  const running = cumulative(points);
  const hover = active != null ? running[active] : null;

  return (
    <div className="strategy-detail">
      <div className="readout">
        <div className="readout-number">{usd(hover ? hover.total : s.totals.bonus)}</div>
        <div className="readout-sub">
          {hover ? (
            <><span className="up">+{usd(hover.amount)}</span> from {hover.label} · ~{shortDate(hover.date, today)}</>
          ) : (
            <>in bonuses by ~{s.totals.lastPayout ? shortDate(s.totals.lastPayout, today) : '–'} · <span className="up">{usd(s.totals.net)} net</span></>
          )}
        </div>
      </div>
      <PayoutChart points={points} start={today} active={active} onActive={setActive} />
      <div className="chart-axis">
        <span>Today</span>
        <span>{s.totals.lastPayout ? shortDate(s.totals.lastPayout, today) : ''}</span>
      </div>

      <dl className="stats compact">
        <div><dt>Accounts</dt><dd>{s.totals.accounts}</dd></div>
        <div><dt>First bonus</dt><dd>{s.totals.firstPayout ? shortDate(s.totals.firstPayout, today) : '–'}</dd></div>
        <div><dt>Last bonus</dt><dd>{s.totals.lastPayout ? shortDate(s.totals.lastPayout, today) : '–'}</dd></div>
        <div><dt>Parks up to</dt><dd>{s.totals.peakParked > 0 ? usd(s.totals.peakParked) : 'Nothing'}</dd></div>
      </dl>

      <div className="list-head">
        <h3>Schedule</h3>
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
                  <div className="what-head">
                    <span>Open <button type="button" className="bank-link" onClick={() => onOpenDeal(i.deal)}>{i.deal.bank}</button></span>
                    <span className="what-amount">{usd(i.value.bonus)}</span>
                  </div>
                  {i.deposits.length > 0 && (
                    <div className="small">Route {i.deposits.map((d) => `${usd(d.amount)} on ${shortDate(d.date, today)}`).join(', ')}</div>
                  )}
                  {i.park && <div className="small">Park {usd(i.park.amount)} until {shortDate(i.park.until, today)}</div>}
                  {i.transactionsBy && <div className="small">Make {i.deal.transactions} transactions by {shortDate(i.transactionsBy, today)}</div>}
                  {i.deal.promoCode && <div className="small">Promo code <span className="code">{i.deal.promoCode}</span></div>}
                  <div className="muted small">Bonus ~{shortDate(i.expectedPayout, today)} · keep open until {shortDate(i.closeAfter, today)}</div>
                  {i.assumed.length > 0 && <div className="assume">Assumed: {i.assumed.join('; ')}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )) : (
        <ul className="timeline" style={{ marginTop: 6 }}>
          {s.paychecks.map((p) => (
            <li key={p.date}>
              <span className="when">{shortDate(p.date, today)}</span>
              <div className="splits">
                {p.splits.map((x) => {
                  const deal = s.items.find((i) => i.deal.id === x.dealId)?.deal;
                  return (
                    <span key={x.dealId}>
                      {usd(x.amount)} →{' '}
                      {deal ? <button type="button" className="bank-link" onClick={() => onOpenDeal(deal)}>{x.bank}</button> : <b>{x.bank}</b>}
                    </span>
                  );
                })}
                {(p.toMain > 0 || !p.splits.length) && (
                  <span className="to-main">{p.splits.length ? `rest (${usd(p.toMain)}) → your main account` : 'All to your main account'}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="save-row">
        <span className="muted small grow">
          {signedIn ? 'Saving adds these accounts to Accounts as “planned”.' : 'Sign in to save this plan and track it.'}
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
