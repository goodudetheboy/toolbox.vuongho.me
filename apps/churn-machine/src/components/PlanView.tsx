import { useMemo, useState } from 'react';
import type { Deal } from '../lib/types';
import {
  buildStrategies, buildStrategy, DEFAULT_SPLITS, OBJECTIVES, SPLIT_OPTIONS, splitLabel, payWhen, rollPayday, sortStrategies, STRATEGY_SORTS, type PlanInputs, type Strategy, type StrategySort,
} from '../lib/planner';
import { shortDate } from '../lib/dates';
import { compactUsd, requirementLines, requirementSummary, usd, type FeePlan } from '../lib/value';
import { usePersisted } from '../lib/settings';
import { Check, DealPicker, Disclosure, ExcludeBanks, MoneyInput, PaycheckRows, Segmented, VerdictTag, type Exclusion } from './bits';
import { cumulative, PayoutChart, Sparkline, type PayoutPoint } from './PayoutChart';
import { Sheet } from './DealModal';
import { decodePlanLink, encodePlanLink } from '../lib/planLink';
import type { PlanStep, Route } from '../lib/router';

type StoredInputs = Omit<PlanInputs, 'state' | 'excludeBanks'>;

function defaults(today: string): StoredInputs {
  return {
    paycheck: 2500,
    payFreq: 'semimonthly',
    firstPayday: rollPayday(today, today, 'semimonthly'),
    months: 6,
    cash: 0,
    maxSplits: DEFAULT_SPLITS,
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


export function PlanView({
  deals, dealsDate, today, state, baselineApy, exclusion, onOpenDeal, signedIn, onSave, route, openStrategy, closeStrategy, goStep, picks, setPicks,
}: {
  /** The custom plan's deals (shared with the deal modal's "Add to custom plan"). */
  picks: string[];
  setPicks: (ids: string[]) => void;
  dealsDate: string;
  route: Route;
  openStrategy: (id: string, search: string) => void;
  /** Closes the strategy modal; `fallback` is the step to land on when there's no history to go back to. */
  closeStrategy: (fallback: PlanStep) => void;
  goStep: (step: PlanStep | null) => void;
  deals: Deal[];
  today: string;
  state: string | null;
  baselineApy: number;
  exclusion: Exclusion;
  onOpenDeal: (d: Deal, fee?: FeePlan) => void;
  signedIn: boolean;
  onSave: (s: Strategy, inputs: PlanInputs, baselineApy: number) => Promise<void>;
}) {
  const [stored, setStored] = usePersisted<StoredInputs>('plan-inputs', defaults(today));
  const [sort, setSort] = usePersisted<StrategySort>('plan-sort', 'net');
  const [maxAccounts, setMaxAccounts] = usePersisted<number>('plan-max-accounts', 0);
  // Plan is a few screens: paycheck (/plan) → how (/plan/how) → suggested
  // results, or pick deals (/plan/pick) → custom results. A strategy permalink
  // opens over the results it belongs to.
  const step = route.step;
  const custom = step === 'pick' || step === 'custom' || !!route.strategyId?.startsWith('custom-');
  const results: PlanStep | null = route.strategyId ? (custom ? 'custom' : 'suggested') : step;
  // Only the results screens need the (slow-ish) strategy build.
  const onResults = results === 'suggested' || results === 'custom';
  const set = (patch: Partial<StoredInputs>) => setStored({ ...stored, ...patch });
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Inputs stored before the pay schedule setting get the 1st and 15th.
  // Paid on the 1st and 15th (older stored inputs may say every 2 weeks).
  const payFreq = 'semimonthly' as const;
  const startOn = stored.startOn && stored.startOn > today ? stored.startOn : null;
  const start = startOn ?? today;
  const inputs: PlanInputs = {
    ...stored,
    payFreq,
    startOn,
    picks: custom ? picks : [],
    firstPayday: rollPayday(stored.firstPayday, start, payFreq),
    state,
    excludeBanks: exclusion.effective,
  };
  const key = JSON.stringify(inputs);
  const strategies = useMemo(
    () => (!onResults || (custom && !inputs.picks.length) ? [] : buildStrategies(deals, inputs, today, baselineApy, custom)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, key, today, baselineApy, custom, onResults],
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

  const paycheckRows = (
    <PaycheckRows
      paycheck={stored.paycheck}
      firstPayday={inputs.firstPayday}
      today={start}
      onChange={set}
      beforePayday={
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
      }
    />
  );

  // Results screens keep every setting at hand (right panel on desktop,
  // a collapsible card on phones), so nothing means going back to step 1.
  const settingsPanel = (
    <aside className="layout-side">
      <div className={`card order-card plan-settings ${settingsOpen ? 'open' : ''}`}>
        <button type="button" className="plan-settings-toggle" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}>
          <span className="plan-settings-label">
            <b>Your settings</b>
            <span className="muted small">{usd(stored.paycheck)} {payWhen(payFreq)} · {stored.months} mo{custom ? ` · ${inputs.picks.length} deals` : ''}</span>
          </span>
          <span aria-hidden="true">{settingsOpen ? '▴' : '▾'}</span>
        </button>
        <div className="plan-settings-body">
          <h3>Your settings</h3>
          {custom && (
            <div className="field" style={{ marginTop: 10 }}>
              Deals you want
              <DealPicker deals={deals} value={inputs.picks} onChange={setPicks} today={today} />
            </div>
          )}
          <div className="order-rows">
            {paycheckRows}
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
            <Disclosure label={custom ? 'More options' : 'More options and filters'}>
              <div className="stack" style={{ marginTop: 12 }}>
                <label className="field">
                  Most accounts in a plan
                  <select className="input" value={maxAccounts} onChange={(e) => setMaxAccounts(Number(e.target.value))}>
                    <option value={0}>Any number</option>
                    {[4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>Up to {n}</option>)}
                  </select>
                </label>
                {!custom && <ExcludeBanks x={exclusion} />}
                <label className="field">
                  Cash I can park
                  <MoneyInput ariaLabel="Cash to park" value={stored.cash} onChange={(v) => set({ cash: v ?? 0 })} />
                  <span className="hint">Unlocks savings / balance bonuses.</span>
                </label>
                <label className="field">
                  Split a paycheck across up to
                  <Segmented ariaLabel="Max splits" value={inputs.maxSplits} onChange={(maxSplits) => set({ maxSplits })}
                    options={SPLIT_OPTIONS.map((n) => ({ value: n, label: splitLabel(n) }))} />
                  <span className="hint">Accounts per paycheck your payroll allows.</span>
                </label>
                <label className="field">
                  Open accounts ahead of payday by
                  <Segmented ariaLabel="Lead days" value={stored.leadDays} onChange={(leadDays) => set({ leadDays })}
                    options={[3, 7, 14].map((n) => ({ value: n, label: `${n} days` }))} />
                  <span className="hint">Time to switch your direct deposit.</span>
                </label>
                <Check checked={stored.includeDatePassed} onChange={(includeDatePassed) => set({ includeDatePassed })}>Include deals past their listed end date</Check>
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
                <button type="button" className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setStored(defaults(today))}>Reset</button>
              </div>
            </Disclosure>
          </div>
        </div>
      </div>
    </aside>
  );

  const strategyList = (
    <>
      <div className="list-head">
        <h2>{custom ? 'Your plan' : 'Strategies'}</h2>
        {shown.length > 1 && (
          <span className="list-head-controls">
            <select className="input select-quiet" aria-label="Sort plans" value={sort} onChange={(e) => setSort(e.target.value as StrategySort)}>
              {Object.entries(STRATEGY_SORTS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </span>
        )}
      </div>
      {custom && !inputs.picks.length ? (
        <div className="empty">
          You haven’t picked any deals yet. <button type="button" className="more" onClick={() => goStep('pick')}>Pick deals</button>
        </div>
      ) : shown.length === 0 && noFit.length ? (
        <div className="empty">
          None of your picks can be planned with these settings:
          <ul className="missed">{noFit.map((m) => <li key={m.dealId}><b>{m.bank}</b> {m.reason}.</li>)}</ul>
        </div>
      ) : shown.length === 0 && strategies.length > 0 ? (
        <div className="empty">No plan has {maxAccounts} accounts or fewer. Raise “Most accounts in a plan” under More options.</div>
      ) : shown.length === 0 ? (
        <div className="empty">No plan fits. Try a longer plan, a bigger paycheck, more cash to park, or fewer filters.</div>
      ) : (
        <div className="items">
          {shown.map((s) => (
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
          ))}
        </div>
      )}
      <p className="footnote">
        Make sure to check the Doctor of Credit post and the bank’s own deal terms before opening!
      </p>
    </>
  );

  return (
    <>
      {results === null && (
        <div className="narrow plan-step">
          <div className="page-head">
            <div className="step-kicker">Step 1 of 3</div>
            <h1>Your paycheck</h1>
            <p className="muted">Tell us how you get paid and we’ll work out which accounts to open when.</p>
          </div>
          <div className="card order-card">
            <div className="order-rows">{paycheckRows}</div>
          </div>
          <div className="step-actions">
            <button type="button" className="btn primary" onClick={() => goStep('how')}>Next</button>
          </div>
        </div>
      )}

      {results === 'how' && (
        <div className="narrow plan-step">
          <button type="button" className="back" onClick={() => goStep(null)}>← Your paycheck</button>
          <div className="page-head">
            <div className="step-kicker">Step 2 of 3</div>
            <h1>How do you want to plan?</h1>
          </div>
          <div className="choice-buttons">
            <button type="button" className="btn primary" onClick={() => goStep('suggested')}>Suggest strategies</button>
            <button type="button" className="btn primary" onClick={() => goStep('pick')}>Build my own</button>
          </div>
        </div>
      )}

      {results === 'pick' && (
        <div className="narrow plan-step">
          <button type="button" className="back" onClick={() => goStep('how')}>← How to plan</button>
          <div className="page-head">
            <div className="step-kicker">Step 3 of 3</div>
            <h1>Pick your deals</h1>
          </div>
          <div className="card order-card">
            <DealPicker deals={deals} value={picks} onChange={setPicks} today={today} />
          </div>
          <div className="step-actions">
            <button type="button" className="btn primary" disabled={!picks.length} onClick={() => goStep('custom')}>Build my plan</button>
          </div>
        </div>
      )}

      {results === 'suggested' && (
        <>
          <button type="button" className="back" onClick={() => goStep('how')}>← How to plan</button>
          <div className="page-head">
            <h1>Plans for you</h1>
            {!state && <p className="muted small">Showing deals in all states. Set yours in the menu up top.</p>}
          </div>
          <div className="layout">
            {settingsPanel}
            <div className="layout-main">{strategyList}</div>
          </div>
        </>
      )}

      {results === 'custom' && (
        <>
          <button type="button" className="back" onClick={() => goStep('pick')}>← Your deals</button>
          <div className="page-head">
            <h1>Your plan</h1>
          </div>
          <div className="layout">
            {settingsPanel}
            <div className="layout-main">{strategyList}</div>
          </div>
        </>
      )}

      {route.strategyId && (
        <Sheet
          label={linked?.name ?? 'Plan'}
          onClose={() => closeStrategy(custom ? 'custom' : 'suggested')}
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
                      setStored(rest);
                      if (linked.objective === 'custom') setPicks(rest.picks);
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
        {signedIn ? 'Saving puts it in My Bag with a day-by-day checklist.' : 'Sign in to save this plan and track it.'}
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
  onOpenDeal: (d: Deal, fee?: FeePlan) => void;
}) {
  const [view, setView] = useState<'accounts' | 'reqs' | 'schedule'>('accounts');
  const [active, setActive] = useState<number | null>(null);
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

      <div className="detail-tabs">
        <Segmented ariaLabel="View" value={view} onChange={setView}
          options={[{ value: 'accounts', label: 'Accounts to open' }, { value: 'reqs', label: 'Requirements' }, { value: 'schedule', label: 'Schedule' }]} />
      </div>

      {view === 'accounts' ? (
        <div className="items open-items">
          {s.items.map((i) => (
            <button key={i.deal.id} type="button" className="item" onClick={() => onOpenDeal(i.deal, i.value.fee)}>
              <span className="item-main">
                <span className="item-name">{i.deal.bank}</span>
                <span className="item-sub">{requirementSummary(i.deal)}</span>
                <span className="item-meta">
                  Open {i.openOn === today ? 'today' : shortDate(i.openOn, today)} · <VerdictTag verdict={i.value.verdict} />
                </span>
              </span>
              <span className="item-side">
                <span className="pill">{usd(i.value.bonus)}</span>
                <span className={`item-net ${i.value.net > 0 ? '' : 'down'}`}>{usd(i.value.net)} net</span>
              </span>
            </button>
          ))}
        </div>
      ) : view === 'reqs' ? (
        <div className="reqs">
          {s.items.map((i) => (
            <div key={i.deal.id} className="reqs-bank">
              <button type="button" className="bank-link reqs-name" onClick={() => onOpenDeal(i.deal, i.value.fee)}>{i.deal.bank}</button>
              <span className="reqs-bonus">{usd(i.value.bonus)}</span>
              <ul className="bullets">{requirementLines(i.deal, i.value.fee).map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="schedule">
          {scheduleDays(s).map((day) => (
            <li key={day.date}>
              <span className="when">{day.date === today ? 'Today' : shortDate(day.date, today)}</span>
              <div className="schedule-what">
                {day.opens.length > 0 && <div>Open {day.opens.join(', ')}</div>}
                {day.routes.length > 0 && (
                  <div>Paycheck: {day.routes.map((r) => `${usd(r.amount)} to ${r.bank}${r.upkeep ? ' (keeps its fee waived)' : ''}`).join(', ')}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What to do on each date: accounts to open and paychecks to route (all-to-main paydays left out). */
type PayRoute = { amount: number; bank: string; upkeep?: boolean };
function scheduleDays(s: Strategy): { date: string; opens: string[]; routes: PayRoute[] }[] {
  const days = new Map<string, { opens: string[]; routes: PayRoute[] }>();
  const day = (date: string) => days.get(date) ?? days.set(date, { opens: [], routes: [] }).get(date)!;
  for (const i of s.items) day(i.openOn).opens.push(i.deal.bank);
  for (const p of s.paychecks) for (const x of p.splits) day(p.date).routes.push({ amount: x.amount, bank: x.bank, upkeep: x.upkeep });
  return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({ date, ...d }));
}
