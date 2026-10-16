import { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  addManualAccount, advance, allBanksIHave, saveBanksIHave, deleteAccount, nextStep, STATUS_LABELS, updateAccount,
  type Account, type AccountStatus, type SavedStrategy,
} from '../lib/accounts';
import { isFinished, neglected, progressOf, stateOf, strategyAccounts, tasksForStrategy } from '../lib/tasks';
import type { Deal } from '../lib/types';
import { ProgressBar, StrategyTracker } from './StrategyTracker';
import { shortDate } from '../lib/dates';
import { usd } from '../lib/value';
import { signInWithGoogle } from '../lib/auth';
import { BankPicker, Disclosure, MoneyInput } from './bits';

export function AccountsView({
  user, authLoading, accounts, strategies, banksIHave, banks, deals, loading, error, today, savedId, openPlan, onBack, onBuildPlan, onOpenDeal,
}: {
  user: User | null;
  authLoading: boolean;
  accounts: Account[];
  strategies: SavedStrategy[];
  /** Banks you listed by hand. */
  banksIHave: string[];
  /** Every bank in the deal data, for the picker. */
  banks: string[];
  deals: Deal[] | null;
  loading: boolean;
  error: string | null;
  today: string;
  /** Show this saved strategy's tracker instead of the list. */
  savedId: string | null;
  openPlan: (id: string) => void;
  onBack: () => void;
  onBuildPlan: () => void;
  onOpenDeal: (d: Deal) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (authLoading) return <div className="empty">Loading…</div>;
  if (!user) {
    return (
      <div className="narrow">
        <div className="page-head"><h1>My Bag</h1></div>
        <div className="card signin">
          <h2>Run your plan day by day</h2>
          <p>Sign in to save a plan, see what to do each day, track the money as it comes in, and get back on track if you fall behind.</p>
          <button type="button" className="btn primary" onClick={() => signInWithGoogle().catch(() => {})}>Sign in with Google</button>
        </div>
      </div>
    );
  }
  if (error) return <div className="notice">Couldn’t load your plans: {error}</div>;
  if (loading) return <div className="empty">Loading your plans…</div>;

  const uid = user.uid;
  if (savedId) {
    const s = strategies.find((x) => x.id === savedId);
    if (!s) {
      return (
        <div className="narrow">
          <button type="button" className="back" onClick={onBack}>← My Bag</button>
          <div className="empty">This plan isn’t in your account (it may have been deleted).</div>
        </div>
      );
    }
    const mine = strategyAccounts(s, accounts);
    return (
      <StrategyTracker
        uid={uid}
        strategy={s}
        accounts={mine}
        deals={deals}
        banks={banks}
        today={today}
        alsoExclude={allBanksIHave(banksIHave, accounts.filter((a) => a.strategyId !== s.id))}
        onBack={onBack}
        onOpenDeal={onOpenDeal}
      />
    );
  }

  const withAccounts = strategies.map((st) => ({ s: st, accts: strategyAccounts(st, accounts) }));
  const active = withAccounts.filter((x) => !x.s.archived && !isFinished(x.accts));
  const done = withAccounts.filter((x) => x.s.archived || isFinished(x.accts));
  const loose = accounts.filter((a) => !a.strategyId);
  const all = progressOf(accounts, today);
  const todayAll = active.flatMap(({ s: st, accts }) =>
    tasksForStrategy(accts, today).filter((t) => !t.optional && ['today', 'overdue'].includes(stateOf(t, today)) && (t.action || stateOf(t, today) === 'today'))
      .map((t) => ({ t, st })));
  const fromTracked = allBanksIHave(banksIHave, accounts).slice(banksIHave.length);

  return (
    <div className="narrow">
      <div className="page-head"><h1>My Bag</h1></div>
      <div className="readout page-readout">
        <div className="readout-kicker">Collected so far</div>
        <div className="readout-number">{usd(all.collected)}</div>
        <div className="readout-sub">
          {all.onTheWay > 0 ? <><span className="up">{usd(all.onTheWay)}</span> on the way</> : 'Nothing pending yet'}
        </div>
      </div>

      {todayAll.length > 0 && (
        <section className="section">
          <h2>To do today</h2>
          <div className="tasks">
            {todayAll.map(({ t, st }) => (
              <button key={`${t.account.id}:${t.key}`} type="button" className={`task link ${stateOf(t, today)}`} onClick={() => openPlan(st.id)}>
                <span className="task-mark" aria-hidden="true" />
                <span className="task-main">
                  <span className="task-title">{t.title}</span>
                  <span className="task-when">
                    {stateOf(t, today) === 'overdue' ? <span className="task-state overdue">Overdue · was due {shortDate(t.date, today)}</span> : <span className="task-state today">Today</span>}
                    <span className="faint"> · {st.name}</span>
                  </span>
                </span>
                <span className="task-go" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2>Active plans</h2>
        {active.length === 0 ? (
          <div className="card empty-card">
            <p>No active plans. Pick one on the Plan tab and press “Use this plan”, and it shows up here with what to do each day.</p>
            <button type="button" className="btn primary" onClick={onBuildPlan}>Build a plan</button>
          </div>
        ) : (
          <div className="items">
            {active.map(({ s: st, accts }) => <PlanCard key={st.id} s={st} accts={accts} today={today} onOpen={() => openPlan(st.id)} />)}
          </div>
        )}
      </section>

      {done.length > 0 && (
        <div className="toolbar" style={{ marginTop: 20 }}>
          <Disclosure label={`Finished and archived (${done.length})`}>
            <div className="items" style={{ flexBasis: '100%' }}>
              {done.map(({ s: st, accts }) => <PlanCard key={st.id} s={st} accts={accts} today={today} onOpen={() => openPlan(st.id)} />)}
            </div>
          </Disclosure>
        </div>
      )}

      <section className="section">
        <h2>Banks I have</h2>
        <p className="muted">
          Banks you have (or had) an account with. Turn on “Exclude banks I already have” on Deals or Plan to hide them, and revisions skip them.
        </p>
        <BankPicker
          banks={banks}
          value={banksIHave}
          onChange={(v) => saveBanksIHave(uid, v).catch((e: Error) => alert(`Couldn’t save: ${e.message}`))}
          placeholder="Add a bank you have"
          ariaLabel="Banks I have"
          allowCustom
        />
        {fromTracked.length > 0 && (
          <p className="hint">Also counted, from accounts you track: {fromTracked.join(', ')}.</p>
        )}
      </section>

      <section className="section">
        <h2>Accounts outside a plan</h2>
        {loose.length === 0 ? (
          <p className="muted">None. Accounts you track from a deal (“I opened this”) or add by hand show up here.</p>
        ) : (
          <div className="list">
            {loose.map((a) => {
              const step = nextStep(a, today);
              const open = openId === a.id;
              return (
                <div key={a.id} className={`row ${open ? 'open' : ''}`}>
                  <button type="button" className="row-head" aria-expanded={open} onClick={() => setOpenId(open ? null : a.id)}>
                    <span className="row-title">{a.bank}</span>
                    <span className="row-amount">{usd(a.status === 'paid' || a.status === 'closed' ? a.bonusReceived ?? a.bonus : a.bonus)}</span>
                    <span className={`row-sub ${step.overdue ? 'status overdue' : ''}`}>
                      {step.text}{step.date ? ` · ${step.date === today ? 'today' : shortDate(step.date, today)}` : ''}
                    </span>
                    <span className="row-side status">{STATUS_LABELS[a.status]}</span>
                  </button>
                  {open && <AccountDetail uid={uid} a={a} today={today} />}
                </div>
              );
            })}
          </div>
        )}
        <div className="toolbar" style={{ marginTop: 12 }}>
          <Disclosure label="Add an account by hand"><AddAccount uid={uid} today={today} /></Disclosure>
        </div>
      </section>
    </div>
  );
}

function PlanCard({ s, accts, today, onOpen }: { s: SavedStrategy; accts: Account[]; today: string; onOpen: () => void }) {
  const tasks = tasksForStrategy(accts, today);
  const p = progressOf(accts, today);
  const dueToday = tasks.filter((t) => stateOf(t, today) === 'today' && !t.optional).length;
  const missed = neglected(tasks, today).length;
  const parts = [
    p.start && p.start > today ? `Starts ${shortDate(p.start, today)}` : p.days ? `Day ${Math.min(p.day, p.days)} of ${p.days}` : null,
    dueToday ? `${dueToday} to do today` : null,
  ].filter(Boolean).join(' · ');
  return (
    <button type="button" className="item plan-card" onClick={onOpen}>
      <span className="item-main">
        <span className="item-name">{s.name}</span>
        <span className="item-sub">
          {parts || `${accts.length} accounts`}
          {missed > 0 && <span className="task-state overdue"> · {missed} overdue</span>}
        </span>
        <ProgressBar collected={p.collected} onTheWay={p.onTheWay} planned={p.planned} />
      </span>
      <span className="item-side">
        <span className="pill">{usd(p.collected)}</span>
        <span className="item-net">of {usd(p.planned)}</span>
      </span>
    </button>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <label className="field">
      {label}
      <input className="input" type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />
    </label>
  );
}

export function AccountDetail({ uid, a, today }: { uid: string; a: Account; today: string }) {
  const step = nextStep(a, today);
  const [notes, setNotes] = useState(a.notes);
  const save = (patch: Partial<Account>) => updateAccount(uid, a.id, patch).catch((e: Error) => alert(`Couldn’t save: ${e.message}`));

  return (
    <div className="detail">
      {a.title !== a.bank && <p className="meta" style={{ marginTop: 6 }}>{a.title}</p>}
      {a.strategyName && <p className="meta" style={{ margin: '2px 0' }}>Part of “{a.strategyName}”.</p>}

      {(a.deposits.length > 0 || a.park || a.transactions) && (
        <>
          <h4>The plan</h4>
          <ul>
            {a.openOn && <li>Open by {shortDate(a.openOn, today)}</li>}
            {a.deposits.length > 0 && <li>Route {a.deposits.map((d) => `${usd(d.amount)} on ${shortDate(d.date, today)}`).join(', ')}</li>}
            {a.park && <li>Park {usd(a.park.amount)} until {shortDate(a.park.until, today)}</li>}
            {a.transactions ? <li>Make {a.transactions} transactions</li> : null}
            {a.doneBy && <li>Requirements done by {shortDate(a.doneBy, today)}</li>}
            {a.expectedPayout && <li>Bonus expected ~{shortDate(a.expectedPayout, today)}</li>}
            {a.closeAfter && <li>Keep open until {shortDate(a.closeAfter, today)}</li>}
          </ul>
        </>
      )}

      <h4>What happened</h4>
      <div className="form-grid">
        <label className="field">
          Status
          <select className="input" value={a.status} onChange={(e) => save({ status: e.target.value as AccountStatus })}>
            {Object.entries(STATUS_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <DateField label="Opened" value={a.openedOn} onChange={(openedOn) => save({ openedOn })} />
        <DateField label="Requirements done" value={a.metOn} onChange={(metOn) => save({ metOn })} />
        <DateField label="Bonus received" value={a.paidOn} onChange={(paidOn) => save({ paidOn })} />
        <label className="field">
          Bonus amount received
          <MoneyInput ariaLabel="Bonus received" value={a.bonusReceived} placeholder={String(a.bonus)} onChange={(bonusReceived) => save({ bonusReceived })} />
        </label>
        <DateField label="Keep open until" value={a.closeAfter} onChange={(closeAfter) => save({ closeAfter })} />
        <DateField label="Closed" value={a.closedOn} onChange={(closedOn) => save({ closedOn })} />
      </div>
      <label className="field" style={{ marginTop: 12 }}>
        Notes
        <textarea
          className="input"
          rows={2}
          value={notes}
          placeholder="Login, which card you used, anything to remember"
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== a.notes && save({ notes })}
        />
      </label>

      <div className="acct-actions">
        {step.action && (
          <button type="button" className="btn primary" onClick={() => save(advance(a, step.action!, today))}>{step.actionLabel}</button>
        )}
        {a.docUrl && <a href={a.docUrl} target="_blank" rel="noreferrer">Doctor of Credit post ↗</a>}
        <span className="grow" />
        <button
          type="button"
          className="btn quiet small"
          onClick={() => confirm(`Delete ${a.bank} from your records?`) && deleteAccount(uid, a.id)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function AddAccount({ uid, today }: { uid: string; today: string }) {
  const [bank, setBank] = useState('');
  const [bonus, setBonus] = useState<number | null>(null);
  const [opened, setOpened] = useState(today);
  return (
    <form
      className="panel"
      style={{ flexBasis: '100%' }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!bank.trim()) return;
        await addManualAccount(uid, bank.trim(), bonus ?? 0, opened);
        setBank('');
        setBonus(null);
      }}
    >
      <div className="form-grid">
        <label className="field">Bank<input className="input" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="e.g. Chase" /></label>
        <label className="field">Bonus<MoneyInput ariaLabel="Bonus" value={bonus} onChange={setBonus} /></label>
        <label className="field">Opened<input className="input" type="date" value={opened} onChange={(e) => setOpened(e.target.value)} /></label>
      </div>
      <div style={{ marginTop: 12 }}><button className="btn primary" type="submit" disabled={!bank.trim()}>Add</button></div>
    </form>
  );
}
