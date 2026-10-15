import { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  addManualAccount, advance, archiveStrategy, deleteAccount, deleteStrategy, nextStep, STATUS_LABELS, updateAccount,
  type Account, type AccountStatus, type SavedStrategy,
} from '../lib/accounts';
import { shortDate } from '../lib/dates';
import { usd } from '../lib/value';
import { signInWithGoogle } from '../lib/auth';
import { Disclosure, MoneyInput } from './bits';

export function AccountsView({ user, authLoading, accounts, strategies, loading, error, today }: {
  user: User | null;
  authLoading: boolean;
  accounts: Account[];
  strategies: SavedStrategy[];
  loading: boolean;
  error: string | null;
  today: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>('all');

  if (authLoading) return <div className="empty">Loading…</div>;
  if (!user) {
    return (
      <div className="panel signin">
        <h2 style={{ margin: 0, fontSize: 18 }}>Keep a record of your accounts</h2>
        <p>Sign in to save a plan, track which accounts you have open, what each one still needs, and when it’s safe to close.</p>
        <button type="button" className="btn primary" onClick={() => signInWithGoogle().catch(() => {})}>Sign in with Google</button>
      </div>
    );
  }
  if (error) return <div className="notice">Couldn’t load your accounts: {error}</div>;
  if (loading) return <div className="empty">Loading your accounts…</div>;

  const uid = user.uid;
  const inPlan = (a: Account) => plan === 'all' || (plan === 'none' ? !a.strategyId : a.strategyId === plan);
  const visible = accounts.filter(inPlan);
  const active = visible
    .filter((a) => a.status !== 'closed')
    .map((a) => ({ a, step: nextStep(a, today) }))
    .sort((x, y) => (x.step.date ?? '9999').localeCompare(y.step.date ?? '9999') || x.a.bank.localeCompare(y.a.bank));
  const closed = visible.filter((a) => a.status === 'closed');

  const earned = visible.reduce((t, a) => t + (a.status === 'paid' || a.status === 'closed' ? a.bonusReceived ?? a.bonus : 0), 0);
  const pending = visible.reduce((t, a) => t + (a.status === 'open' || a.status === 'met' ? a.bonus : 0), 0);
  const openCount = visible.filter((a) => a.status !== 'planned' && a.status !== 'closed').length;
  const planned = visible.filter((a) => a.status === 'planned').length;

  return (
    <>
      <div className="summary">
        <div><b>{usd(earned)}</b><span>earned</span></div>
        <div><b>{usd(pending)}</b><span>in progress</span></div>
        <div><b>{openCount}</b><span>open accounts</span></div>
        {planned > 0 && <div><b>{planned}</b><span>planned</span></div>}
      </div>

      {strategies.length > 0 && (
        <div className="toolbar">
          <select className="input" aria-label="Which plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="all">All accounts</option>
            {strategies.filter((s) => !s.archived || s.id === plan).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="none">Not in a plan</option>
          </select>
        </div>
      )}

      {active.length === 0 ? (
        <div className="empty">
          No accounts yet. Pick a plan on the Plan tab, or open a deal and press “I opened this”.
        </div>
      ) : (
        <div className="list">
          {active.map(({ a, step }) => {
            const open = openId === a.id;
            return (
              <div key={a.id} className={`row ${open ? 'open' : ''}`}>
                <button type="button" className="row-head" aria-expanded={open} onClick={() => setOpenId(open ? null : a.id)}>
                  <span className="row-title">{a.bank}</span>
                  <span className="row-amount">{usd(a.status === 'paid' ? a.bonusReceived ?? a.bonus : a.bonus)}</span>
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

      <div className="toolbar" style={{ marginTop: 16, gap: 18 }}>
        <Disclosure label="Add an account by hand"><AddAccount uid={uid} today={today} /></Disclosure>
      </div>
      {closed.length > 0 && (
        <div className="toolbar" style={{ gap: 18 }}>
          <Disclosure label={`Closed (${closed.length})`}>
            <div className="list" style={{ flexBasis: '100%' }}>
              {closed.map((a) => (
                <div key={a.id} className={`row ${openId === a.id ? 'open' : ''}`}>
                  <button type="button" className="row-head" onClick={() => setOpenId(openId === a.id ? null : a.id)}>
                    <span className="row-title">{a.bank}</span>
                    <span className="row-amount">{usd(a.bonusReceived ?? 0)}</span>
                    <span className="row-sub">
                      {a.openedOn ? `Opened ${shortDate(a.openedOn, today)}` : ''}{a.closedOn ? ` · closed ${shortDate(a.closedOn, today)}` : ''}
                    </span>
                    <span className="row-side status">Closed</span>
                  </button>
                  {openId === a.id && <AccountDetail uid={uid} a={a} today={today} />}
                </div>
              ))}
            </div>
          </Disclosure>
        </div>
      )}
      {strategies.length > 0 && (
        <div className="toolbar" style={{ gap: 18 }}>
          <Disclosure label={`Saved plans (${strategies.length})`}>
            <div className="list" style={{ flexBasis: '100%' }}>
              {strategies.map((s) => <PlanRow key={s.id} uid={uid} s={s} accounts={accounts} today={today} />)}
            </div>
          </Disclosure>
        </div>
      )}
    </>
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

function AccountDetail({ uid, a, today }: { uid: string; a: Account; today: string }) {
  const step = nextStep(a, today);
  const [notes, setNotes] = useState(a.notes);
  const save = (patch: Partial<Account>) => updateAccount(uid, a.id, patch).catch((e: Error) => alert(`Couldn’t save: ${e.message}`));

  return (
    <div className="detail">
      {a.title !== a.bank && <p className="meta" style={{ marginTop: 6 }}>{a.title}</p>}
      {a.strategyName && <p className="meta" style={{ margin: '2px 0' }}>Part of “{a.strategyName}”.</p>}

      {(a.deposits.length > 0 || a.park || a.transactions) && (
        <>
          <h3>The plan</h3>
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

      <h3>What happened</h3>
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

function PlanRow({ uid, s, accounts, today }: { uid: string; s: SavedStrategy; accounts: Account[]; today: string }) {
  const mine = accounts.filter((a) => a.strategyId === s.id);
  const paid = mine.filter((a) => a.status === 'paid' || a.status === 'closed').length;
  return (
    <div className="row">
      <div className="row-head" style={{ cursor: 'default' }}>
        <span className="row-title">{s.name}{s.archived && <span className="faint"> · archived</span>}</span>
        <span className="row-amount">{usd(s.totalBonus)}</span>
        <span className="row-sub">
          {usd(s.paycheck)} paychecks from {shortDate(s.firstPayday, today)} · {s.months} months · {paid}/{mine.length} bonuses in
        </span>
        <span className="row-side">
          <button type="button" className="btn quiet small" onClick={() => archiveStrategy(uid, s.id, !s.archived)}>{s.archived ? 'Unarchive' : 'Archive'}</button>
          <button
            type="button"
            className="btn quiet small"
            onClick={() => confirm(`Delete “${s.name}”? Accounts you never opened go with it; opened ones stay.`) && deleteStrategy(uid, s.id, accounts)}
          >
            Delete
          </button>
        </span>
      </div>
    </div>
  );
}
