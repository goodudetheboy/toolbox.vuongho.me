import { useMemo, useState } from 'react';
import type { Deal } from '../lib/types';
import {
  buildStrategies, buildStrategy, OBJECTIVES, payWhen, rollPayday, sortStrategies, STRATEGY_SORTS, type PlanInputs, type Strategy, type StrategySort,
} from '../lib/planner';
import { monthLabel, shortDate } from '../lib/dates';
import { compactUsd, usd } from '../lib/value';
import { usePersisted } from '../lib/settings';
import { Check, DealPicker, Disclosure, ExcludeBanks, MoneyInput, PaycheckRows, Segmented, type Exclusion } from './bits';
import { cumulative, PayoutChart, Sparkline, type PayoutPoint } from './PayoutChart';
import { Sheet } from './DealModal';
import { decodePlanLink, encodePlanLink } from '../lib/planLink';
import type { Route } from '../lib/router';

type StoredInputs = Omit<PlanInputs, 'state' | 'excludeBanks'>;

function defaults(today: string): StoredInputs {
  return {
    paycheck: 2500,
    payFreq: 'semimonthly',
    firstPayday: rollPayday(today, today, 'semimonthly'),
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
    startOn: null,
    picks: [],
  };
}

type Mode = 'suggested' | 'custom';

export function PlanView({
  deals, dealsDate, today, state, baselineApy, exclusion, onOpenDeal, signedIn, onSave, route, openStrategy, closeStrategy,
}: {
  dealsDate: string;
  route: Route;
  openStrategy: (id: string, search: string) => void;
  closeStrategy: () => void;
  deals: Deal[];
  today: string;
  state: string | null;
  baselineApy: number;
  exclusion: Exclusion;
  onOpenDeal: (d: Deal) => void;
  signedIn: boolean;
  onSave: (s: Strategy, inputs: PlanInputs, baselineApy: number) => Promise<void>;
}) {
  const [stored, setStored] = usePersisted<StoredInputs>('plan-inputs', defaults(today));
  const [sort, setSort] = usePersisted<StrategySort>('plan-sort', 'net');
  const [maxAccounts, setMaxAccounts] = usePersisted<number>('plan-max-accounts', 0);
  const [mode, setMode] = usePersisted<Mode>('plan-mode', 'suggested');
  const custom = mode === 'custom';
  const set = (patch: Partial<StoredInputs>) => setStored({ ...stored, ...patch });

  // Inputs stored before the pay schedule setting get the 1st and 15th.
  const payFreq = stored.payFreq ?? 'semimonthly';
  const startOn = stored.startOn && stored.startOn > today ? stored.startOn : null;
  const start = startOn ?? today;
  const inputs: PlanInputs = {
    ...stored,
    payFreq,
    startOn,
    picks: custom ? stored.picks ?? [] : [],
    firstPayday: rollPayday(stored.firstPayday, start, payFreq),
    state,
    excludeBanks: exclusion.effective,
  };
  const key = JSON.stringify(inputs);
  const strategies = useMemo(
    () => (custom && !inputs.picks.length ? [] : buildStrategies(deals, inputs, today, baselineApy, custom)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, key, today, baselineApy, custom],
  );
  // When none of your picks can be planned, say why for each.
  const noFit = useMemo(
    () => (custom && inputs.picks.length && !strategies.length ? buildStrategy(deals, inputs, 'custom', 3, today, baselineApy).missed ?? [] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [strategies],
  );
  const shown = sortStrategies(strategies, sort).filter((s) => !maxAccounts || s.totals.accounts <= maxAccounts);
  const linkFor = (i: PlanInputs) => encodePlanLink({ inputs: i, baselineApy, dealsDate });

  // A strategy permalink: rebuild it from the link's own inputs, not the form's.
  const link = route.strategyId ? decodePlanLink(route.search, today) : null;
  const linkKey = link ? JSON.stringify(link) : '';
  const linked = useMemo(() => {
    if (!route.strategyId) return null;
    const list = link ? buildStrategies(deals, link.inputs, today, link.baselineApy, route.strategyId.startsWith('custom-')) : strategies;
    return list.find((x) => x.id === route.strategyId) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals, route.strategyId, linkKey, key, today]);
  const linkInputs = link?.inputs ?? inputs;
  const formMatches = !link || linkFor(link.inputs) === linkFor(inputs);

  return (
    <>
      <div className="page-head">
        <h1>Plan</h1>
        <p className="muted">
          {shown.length
            ? `${shown.length} ${shown.length === 1 ? 'way' : 'ways'} to earn with a ${usd(stored.paycheck)} paycheck${state ? '' : ' (all states; set yours in the menu up top)'}`
            : 'Tell us about your paycheck and we’ll lay out which accounts to open when.'}
        </p>
      </div>
      <div className="layout">
        <aside className="layout-side">
          <div className="card order-card">
            <h3>Build your plan</h3>
            <Segmented<Mode>
              ariaLabel="Plan type"
              value={mode}
              onChange={setMode}
              options={[{ value: 'suggested', label: 'Suggested' }, { value: 'custom', label: 'Custom' }]}
            />
            {custom && (
              <div className="field" style={{ marginTop: 14 }}>
                Deals you want
                <DealPicker deals={deals} value={inputs.picks} onChange={(picks) => set({ picks })} today={today} />
                <span className="hint">We’ll schedule these around your paychecks and tell you if any don’t fit.</span>
              </div>
            )}
            <div className="order-rows">
              <PaycheckRows paycheck={stored.paycheck} payFreq={payFreq} firstPayday={inputs.firstPayday} today={start} onChange={set} />
              <label className="order-row">
                <span>Start</span>
                <input
                  className="input"
                  type="date"
                  aria-label="Plan start date"
                  value={start}
                  min={today}
                  onChange={(e) => e.target.value && set({ startOn: e.target.value > today ? e.target.value : null })}
                />
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
              <Disclosure label="More options">
                <div className="stack" style={{ marginTop: 12 }}>
                  {!custom && <ExcludeBanks x={exclusion} />}
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
                  {!custom && (
                    <>
                      <label className="field">
                        Skip bonuses under
                        <MoneyInput ariaLabel="Minimum bonus" value={stored.minBonus} onChange={(v) => set({ minBonus: v ?? 0 })} />
                      </label>
                      <Check checked={stored.noHardPull} onChange={(noHardPull) => set({ noHardPull })}>Avoid hard credit pulls</Check>
                      <Check checked={stored.online} onChange={(online) => set({ online })}>Online only (no branch visits)</Check>
                      <Check checked={stored.noChexSensitive} onChange={(noChexSensitive) => set({ noChexSensitive })}>Skip ChexSystems-sensitive banks</Check>
                      <Check checked={stored.business} onChange={(business) => set({ business })}>Include business accounts</Check>
                    </>
                  )}
                  <Check checked={stored.includeDatePassed} onChange={(includeDatePassed) => set({ includeDatePassed })}>Include deals past their listed end date</Check>
                  <button type="button" className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setStored({ ...defaults(today), picks: stored.picks ?? [] })}>Reset</button>
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

          {custom && !inputs.picks.length ? (
            <div className="empty">Pick the deals you want and we’ll schedule them around your paychecks.</div>
          ) : shown.length === 0 && noFit.length ? (
            <div className="empty">
              None of your picks can be planned with these settings:
              <ul className="missed">{noFit.map((m) => <li key={m.dealId}><b>{m.bank}</b> {m.reason}.</li>)}</ul>
            </div>
          ) : shown.length === 0 ? (
            <div className="empty">No plan fits. Try a longer plan, a bigger paycheck, more cash to park, or fewer restrictions.</div>
          ) : (
            <div className="items">
              {shown.map((s) => {
                return (
                  <div key={s.id} className="strategy">
                    <button type="button" className="item" onClick={() => openStrategy(s.id, linkFor(inputs))}>
                      <span className="item-main">
                        <span className="item-name">{s.name}</span>
                        <span className="item-sub">
                          {custom ? `${s.totals.accounts} of ${inputs.picks.length} deals fit` : `${s.totals.accounts} accounts`}
                          {s.totals.peakParked > 0 && ` · parks up to ${compactUsd(s.totals.peakParked)}`}
                        </span>
                      </span>
                      <Sparkline points={payoutPoints(s)} start={start} />
                      <span className="item-side">
                        <span className="pill">{usd(s.totals.net)}</span>
                        <span className="item-net">net</span>
                      </span>
                    </button>
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

      {route.strategyId && (
        <Sheet
          label={linked?.name ?? 'Plan'}
          onClose={closeStrategy}
          bar={linked && <ShareButton title={`${linked.name}: ${usd(linked.totals.net)} in bank bonuses`} />}
          foot={linked && <SaveRow signedIn={signedIn} onSave={() => onSave(linked, linkInputs, link?.baselineApy ?? baselineApy)} />}
        >
          {linked ? (
            <>
              <div className="hero">
                <div className="hero-kicker">{OBJECTIVES[linked.objective].hint}</div>
                <h1 className="hero-name">{linked.name}</h1>
                <p className="muted small" style={{ margin: '6px 0 0' }}>
                  {linkInputs.startOn && `Starts ${shortDate(linkInputs.startOn, today)} · `}
                  {usd(linkInputs.paycheck)} paychecks {payWhen(linkInputs.payFreq)} from {shortDate(linkInputs.firstPayday, today)} · {linkInputs.months} months
                  {linkInputs.cash > 0 && ` · ${usd(linkInputs.cash)} to park`}
                  {linkInputs.state && ` · ${linkInputs.state}`}
                  {linkInputs.excludeBanks.length > 0 && ` · ${linkInputs.excludeBanks.length} ${linkInputs.excludeBanks.length === 1 ? 'bank' : 'banks'} excluded`}
                </p>
                {!formMatches && link && (
                  <button
                    type="button"
                    className="btn ghost small"
                    style={{ marginTop: 8, marginLeft: -14 }}
                    onClick={() => {
                      const { state: _s, excludeBanks: _e, ...rest } = link.inputs;
                      const linkCustom = linked.objective === 'custom';
                      setStored({ ...rest, picks: linkCustom ? rest.picks : stored.picks ?? [] });
                      setMode(linkCustom ? 'custom' : 'suggested');
                    }}
                  >
                    Use these settings in my plan
                  </button>
                )}
              </div>
              {link?.dealsDate && link.dealsDate !== dealsDate && (
                <div className="notice">
                  This link was made with deals from {shortDate(link.dealsDate, today)}. It’s rebuilt from today’s deals, so it may differ from what was shared.
                </div>
              )}
              {linked.missed && linked.missed.length > 0 && (
                <div className="notice">
                  {linked.missed.length === 1 ? 'One of your picks didn’t fit:' : `${linked.missed.length} of your picks didn’t fit:`}
                  <ul className="missed">{linked.missed.map((m) => <li key={m.dealId}><b>{m.bank}</b> {m.reason}.</li>)}</ul>
                </div>
              )}
              <StrategyDetail strategy={linked} today={today} onOpenDeal={onOpenDeal} />
            </>
          ) : (
            <div className="empty">
              This plan can’t be rebuilt from today’s deals (some of them may have ended). Close this to see the plans that fit now.
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

/** Share sheet on phones, copy to clipboard elsewhere. */
function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn ghost small"
      title="The link carries this plan’s settings, including the banks it leaves out, so it opens the same plan for anyone."
      onClick={async () => {
        const url = window.location.href;
        if (navigator.share && matchMedia('(pointer: coarse)').matches) {
          await navigator.share({ title, url }).catch(() => {});
          return;
        }
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? '✓ Link copied' : 'Share link'}
    </button>
  );
}

function SaveRow({ signedIn, onSave }: { signedIn: boolean; onSave: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  return (
    <div className="save-row">
      <span className="muted small grow">
        {signedIn ? 'Saving puts it in My plans with a day-by-day checklist.' : 'Sign in to save this plan and track it.'}
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
  );
}

const payoutPoints = (s: Strategy): PayoutPoint[] =>
  s.items.map((i) => ({ date: i.expectedPayout, amount: i.value.bonus, label: i.deal.bank }));

function StrategyDetail({ strategy: s, today, onOpenDeal }: {
  strategy: Strategy;
  today: string;
  onOpenDeal: (d: Deal) => void;
}) {
  const [view, setView] = useState<'accounts' | 'paychecks'>('accounts');
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

    </div>
  );
}
