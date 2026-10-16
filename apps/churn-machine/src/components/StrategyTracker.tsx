// One saved strategy, run day to day: where you are, what's due today, the
// whole plan as a timeline, and a check-in that can re-plan the rest.
import { useMemo, useState } from 'react';
import type { Deal } from '../lib/types';
import {
  applyRevision, archiveStrategy, deleteStrategy, STATUS_LABELS, updateAccount, type Account, type SavedStrategy,
} from '../lib/accounts';
import {
  completeTask, neglected, progressOf, stateOf, tasksForStrategy, undoTask, waiting, type Task,
} from '../lib/tasks';
import { planSettings, planStart, previewRevision, type PlanSettings, type RevisionPreview } from '../lib/revise';
import { OBJECTIVES, PACE_LABELS, payWhen, rollPayday, type Objective, type Pace } from '../lib/planner';
import { addDays, monthLabel, shortDate } from '../lib/dates';
import { usd } from '../lib/value';
import { BankPicker, Check, Disclosure, MoneyInput, PaycheckRows, Segmented } from './bits';
import { Sheet } from './DealModal';
import { AccountDetail } from './AccountsView';

const longToday = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

export function ProgressBar({ collected, onTheWay, planned }: { collected: number; onTheWay: number; planned: number }) {
  const pct = (n: number) => `${planned ? Math.min(100, (n / planned) * 100) : 0}%`;
  return (
    <div className="progress" role="img" aria-label={`${usd(collected)} collected and ${usd(onTheWay)} on the way, of ${usd(planned)}`}>
      <span className="progress-got" style={{ width: pct(collected) }} />
      <span className="progress-coming" style={{ width: pct(onTheWay) }} />
    </div>
  );
}

export function StrategyTracker({ uid, strategy: s, accounts, deals, banks, today, alsoExclude, onBack, onOpenDeal }: {
  uid: string;
  strategy: SavedStrategy;
  /** This strategy's accounts. */
  accounts: Account[];
  deals: Deal[] | null;
  /** Every bank in the deal data, for the "leave out" picker. */
  banks: string[];
  today: string;
  /** Banks you have outside this plan, so a revision doesn't pick them. */
  alsoExclude: string[];
  onBack: () => void;
  onOpenDeal: (d: Deal) => void;
}) {
  const [revision, setRevision] = useState<RevisionPreview | null>(null);
  const [editing, setEditing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [openAccount, setOpenAccount] = useState<string | null>(null);
  const tasks = tasksForStrategy(accounts, today);
  const p = progressOf(accounts, today);
  const missed = neglected(tasks, today);
  const late = waiting(tasks, today);
  const dueToday = tasks.filter((t) => stateOf(t, today) === 'today' && !t.optional);
  const soon = tasks.filter((t) => stateOf(t, today) === 'upcoming' && t.date <= addDays(today, 14));
  const nextUp = tasks.find((t) => stateOf(t, today) === 'upcoming');
  const months = [...new Set(tasks.map((t) => t.date.slice(0, 7)))];
  const set = planSettings(s);
  const dealFor = (a: Account) => deals?.find((d) => d.id === a.dealId) ?? null;

  const save = (a: Account, patch: Partial<Account>) =>
    updateAccount(uid, a.id, patch).catch((e: Error) => alert(`Couldn’t save: ${e.message}`));
  const row = (t: Task, compact = false) => (
    <TaskRow key={`${t.account.id}:${t.key}`} task={t} today={today} compact={compact}
      onDone={(amount) => save(t.account, completeTask(t, today, amount))}
      onUndo={() => save(t.account, undoTask(t))}
      onBank={dealFor(t.account) ? () => onOpenDeal(dealFor(t.account)!) : undefined} />
  );

  return (
    <div className="narrow tracker">
      <button type="button" className="back" onClick={onBack}>← My plans</button>
      <div className="hero">
        <div className="hero-kicker">
          Today is {longToday(today)}{p.days ? ` · day ${Math.min(p.day, p.days)} of ${p.days}` : ''}
        </div>
        <h1 className="hero-name">{s.name}</h1>
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          {usd(set.inputs.paycheck)} paychecks {payWhen(set.inputs.payFreq)} · {set.inputs.months} months{s.archived && ' · archived'}
          {' · '}
          <button type="button" className="more" disabled={!deals} onClick={() => setEditing(true)}>Edit settings</button>
        </p>
      </div>

      <div className="readout" style={{ marginTop: 20 }}>
        <div className="readout-kicker">Collected</div>
        <div className="readout-number">{usd(p.collected)}</div>
        <div className="readout-sub">
          of {usd(p.planned)} planned{p.onTheWay > 0 && <> · <span className="up">{usd(p.onTheWay)} on the way</span></>}
        </div>
      </div>
      <ProgressBar collected={p.collected} onTheWay={p.onTheWay} planned={p.planned} />

      {missed.length > 0 && (
        <div className="checkin">
          <div className="checkin-head">
            <div>
              <h3>Check-in: {missed.length} {missed.length === 1 ? 'thing was' : 'things were'} due and {missed.length === 1 ? 'isn’t' : 'aren’t'} done</h3>
              <p className="muted small">Mark any you actually did. For the rest, revise the plan: it reschedules from today around what you’ve already opened.</p>
            </div>
          </div>
          <div className="tasks">{missed.map((t) => row(t))}</div>
          <button
            type="button"
            className="btn primary"
            disabled={!deals}
            onClick={() => deals && setRevision(previewRevision(deals, s, accounts, today, alsoExclude))}
          >
            Revise plan
          </button>
        </div>
      )}

      {late.length > 0 && (
        <section className="section">
          <h2>Waiting on the bank</h2>
          <p className="muted small">Bonuses often post late. Mark them when they land; check the post if one is very late.</p>
          <div className="tasks">{late.map((t) => row(t))}</div>
        </section>
      )}

      <section className="section">
        <h2>Today</h2>
        {dueToday.length ? (
          <div className="tasks">{dueToday.map((t) => row(t))}</div>
        ) : (
          <p className="muted">
            Nothing to do today.{nextUp && <> Next: {nextUp.title.charAt(0).toLowerCase() + nextUp.title.slice(1)} on {shortDate(nextUp.date, today)}.</>}
          </p>
        )}
      </section>

      {soon.length > 0 && (
        <section className="section">
          <h2>Next two weeks</h2>
          <div className="tasks">{soon.map((t) => row(t))}</div>
        </section>
      )}

      <section className="section">
        <h2>The whole plan</h2>
        {months.map((m) => {
          const inMonth = tasks.filter((t) => t.date.startsWith(m));
          const nowHere = today.startsWith(m);
          return (
            <div key={m}>
              <div className="month">{monthLabel(`${m}-01`)}</div>
              <div className="tasks timeline-tasks">
                {inMonth.map((t, i) => (
                  <div key={`${t.account.id}:${t.key}`}>
                    {nowHere && t.date >= today && (i === 0 || inMonth[i - 1].date < today) && <div className="today-line"><span>Today</span></div>}
                    {row(t, true)}
                  </div>
                ))}
                {nowHere && inMonth.every((t) => t.date < today) && <div className="today-line"><span>Today</span></div>}
              </div>
            </div>
          );
        })}
      </section>

      <section className="section">
        <h2>Accounts in this plan</h2>
        <div className="list">
          {accounts.map((a) => (
            <div key={a.id} className={`row ${openAccount === a.id ? 'open' : ''}`}>
              <button type="button" className="row-head" aria-expanded={openAccount === a.id} onClick={() => setOpenAccount(openAccount === a.id ? null : a.id)}>
                <span className="row-title">{a.bank}</span>
                <span className="row-amount">{usd(a.status === 'paid' || a.status === 'closed' ? a.bonusReceived ?? a.bonus : a.bonus)}</span>
                <span className="row-sub">{a.openOn ? `Open ${shortDate(a.openOn, today)}` : ''}{a.expectedPayout ? ` · bonus ~${shortDate(a.expectedPayout, today)}` : ''}</span>
                <span className="row-side status">{STATUS_LABELS[a.status]}</span>
              </button>
              {openAccount === a.id && <AccountDetail uid={uid} a={a} today={today} />}
            </div>
          ))}
        </div>
      </section>

      {(s.revisions?.length ?? 0) > 0 && (
        <section className="section">
          <h2>Revisions</h2>
          <ul className="bullets">
            {s.revisions!.map((r, i) => <li key={i}>{shortDate(r.on, today)}: {r.note}</li>)}
          </ul>
        </section>
      )}

      <div className="toolbar" style={{ marginTop: 32 }}>
        <Disclosure label="Manage this plan">
          <div className="acct-actions" style={{ flexBasis: '100%' }}>
            <button type="button" className="btn small" disabled={!deals} onClick={() => deals && setRevision(previewRevision(deals, s, accounts, today, alsoExclude))}>
              Revise from today
            </button>
            <button type="button" className="btn small" disabled={!deals} onClick={() => setEditing(true)}>Edit settings</button>
            <button type="button" className="btn small" onClick={() => archiveStrategy(uid, s.id, !s.archived)}>{s.archived ? 'Unarchive' : 'Archive'}</button>
            <button
              type="button"
              className="btn quiet small"
              onClick={async () => {
                if (!confirm(`Delete “${s.name}”? Accounts you never opened go with it; opened ones stay in your records.`)) return;
                await deleteStrategy(uid, s.id, accounts);
                onBack();
              }}
            >
              Delete plan
            </button>
          </div>
        </Disclosure>
      </div>

      {editing && deals && (
        <EditPlanSheet
          uid={uid}
          strategy={s}
          accounts={accounts}
          deals={deals}
          banks={banks}
          today={today}
          alsoExclude={alsoExclude}
          onClose={() => setEditing(false)}
        />
      )}

      {revision && (
        <Sheet
          label="Revise plan"
          onClose={() => setRevision(null)}
          foot={
            <div className="save-row" style={{ marginTop: 0 }}>
              <button type="button" className="btn quiet" onClick={() => setRevision(null)}>Cancel</button>
              <span className="grow" />
              <button
                type="button"
                className="btn primary"
                disabled={applying}
                onClick={async () => {
                  setApplying(true);
                  try {
                    await applyRevision(uid, s.id, revision.change);
                    setRevision(null);
                  } catch (e) {
                    alert(`Couldn’t revise: ${(e as Error).message}`);
                  } finally {
                    setApplying(false);
                  }
                }}
              >
                {applying ? 'Saving…' : 'Apply changes'}
              </button>
            </div>
          }
        >
          <div className="hero">
            <div className="hero-kicker">From {longToday(today)}</div>
            <h1 className="hero-name">Revise plan</h1>
          </div>
          <p className="muted">
            Keeps every account you’ve opened and moves its missed deposits onto your next paychecks. Everything not opened yet is re-picked to fit, same goal and pace.
          </p>
          <div className="summary-rows" style={{ marginTop: 16 }}>
            <div><span>Planned before</span><span>{usd(revision.before)}</span></div>
            <div className="total"><span>Planned after</span><span className={revision.after >= revision.before ? 'up' : 'down'}>{usd(revision.after)}</span></div>
          </div>
          <section className="section">
            <h2>What changes</h2>
            <ul className="changes">
              {revision.lines.map((l, i) => <li key={i} className={l.tone}>{l.text}</li>)}
            </ul>
          </section>
        </Sheet>
      )}
    </div>
  );
}

const STATE_LABEL = { done: 'Done', overdue: 'Overdue', today: 'Today', upcoming: '' };

function TaskRow({ task: t, today, compact, onDone, onUndo, onBank }: {
  task: Task;
  today: string;
  compact: boolean;
  onDone: (bonusReceived?: number | null) => void;
  onUndo: () => void;
  onBank?: () => void;
}) {
  const st = stateOf(t, today);
  const [amount, setAmount] = useState(String(t.account.bonus));
  const bank = t.account.bank;
  const i = t.title.indexOf(bank);
  const title = onBank && i >= 0
    ? <>{t.title.slice(0, i)}<button type="button" className="bank-link" onClick={onBank}>{bank}</button>{t.title.slice(i + bank.length)}</>
    : t.title;
  return (
    <div className={`task ${st} ${t.optional ? 'optional' : ''} ${compact ? 'compact' : ''}`}>
      <span className="task-mark" aria-hidden="true">{st === 'done' ? '✓' : ''}</span>
      <div className="task-main">
        <div className="task-title">{title}</div>
        {!compact && t.detail && st !== 'done' && <div className="task-detail">{t.detail}</div>}
        <div className="task-when">
          {STATE_LABEL[st] && <span className={`task-state ${st}`}>{STATE_LABEL[st]}</span>}
          {st === 'done'
            ? t.doneOn && t.doneOn !== t.date ? ` ${shortDate(t.doneOn, today)}` : ''
            : st !== 'today' && <>{st === 'overdue' ? ' · was due ' : ''}{shortDate(t.date, today)}</>}
          {t.optional && st !== 'done' && <span className="faint"> · optional</span>}
        </div>
      </div>
      <div className="task-actions">
        {st === 'done' ? (
          !compact ? null : <button type="button" className="btn quiet small" onClick={onUndo}>Undo</button>
        ) : t.kind === 'bonus' && !compact ? (
          <span className="bonus-in">
            <span className="money-input">
              <span>$</span>
              <input className="input" inputMode="numeric" aria-label="Bonus received" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
            </span>
            <button type="button" className="btn primary small" onClick={() => onDone(Number(amount) || t.account.bonus)}>Received</button>
          </span>
        ) : compact && st === 'upcoming' ? null : (
          <button type="button" className={`btn small ${st === 'upcoming' || compact ? 'ghost' : 'primary'}`} onClick={() => onDone()}>
            {t.kind === 'bonus' ? 'Received' : t.kind === 'close' ? 'Closed it' : 'Done'}
          </button>
        )}
      </div>
    </div>
  );
}

/** Change a running plan's settings; the rest of the plan is re-planned from today. */
function EditPlanSheet({ uid, strategy: s, accounts, deals, banks, today, alsoExclude, onClose }: {
  uid: string;
  strategy: SavedStrategy;
  accounts: Account[];
  deals: Deal[];
  banks: string[];
  today: string;
  alsoExclude: string[];
  onClose: () => void;
}) {
  const original = planSettings(s);
  const start = planStart(original);
  const [draft, setDraft] = useState<PlanSettings>(() => (
    { ...original, inputs: { ...original.inputs, firstPayday: rollPayday(original.inputs.firstPayday, today, original.inputs.payFreq) } }
  ));
  const [saving, setSaving] = useState(false);
  const setIn = (patch: Partial<PlanSettings['inputs']>) => {
    const inputs = { ...draft.inputs, ...patch };
    setDraft({ ...draft, inputs, endsOn: addDays(start, Math.round(inputs.months * 30.4)) });
  };
  const key = JSON.stringify(draft);
  const preview = useMemo(
    () => previewRevision(deals, s, accounts, today, alsoExclude, draft),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, deals, accounts, today],
  );
  const i = draft.inputs;

  return (
    <Sheet
      label="Edit plan settings"
      onClose={onClose}
      foot={
        <div className="save-row" style={{ marginTop: 0 }}>
          <span className="muted small grow">
            Planned {usd(preview.before)} → <b className={preview.after >= preview.before ? 'up' : 'down'}>{usd(preview.after)}</b>
          </span>
          <button type="button" className="btn quiet" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn primary"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await applyRevision(uid, s.id, preview.change);
                onClose();
              } catch (e) {
                alert(`Couldn’t save: ${(e as Error).message}`);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : 'Save and re-plan'}
          </button>
        </div>
      }
    >
      <div className="hero">
        <div className="hero-kicker">{s.name}</div>
        <h1 className="hero-name">Edit settings</h1>
      </div>
      <p className="muted">
        Accounts you’ve already opened stay. Everything else is re-planned from today with these settings. Nothing changes until you save.
      </p>

      <div className="stack edit-form">
        <div className="field">
          Goal
          <Segmented<Objective> ariaLabel="Goal" value={draft.objective} onChange={(objective) => setDraft({ ...draft, objective })}
            options={(Object.keys(OBJECTIVES) as Objective[]).map((o) => ({ value: o, label: OBJECTIVES[o].label }))} />
          <span className="hint">{OBJECTIVES[draft.objective].hint}</span>
        </div>
        <div className="field">
          Pace
          <Segmented<Pace> ariaLabel="Pace" value={draft.pace} onChange={(pace) => setDraft({ ...draft, pace })}
            options={([1, 2, 3] as Pace[]).map((p) => ({ value: p, label: PACE_LABELS[p] }))} />
          <span className="hint">Up to {draft.pace} new {draft.pace === 1 ? 'account' : 'accounts'} a month.</span>
        </div>
        <div className="order-rows">
          <PaycheckRows paycheck={i.paycheck} payFreq={i.payFreq} firstPayday={i.firstPayday} today={today} onChange={setIn} />
          <div className="order-row">
            <span>Plan length <span className="faint">ends ~{shortDate(draft.endsOn, today)}</span></span>
            <Segmented ariaLabel="Plan length" value={i.months} onChange={(months) => setIn({ months })}
              options={[3, 6, 9, 12].map((m) => ({ value: m, label: `${m} mo` }))} />
          </div>
          <label className="order-row">
            <span>Cash I can park</span>
            <MoneyInput ariaLabel="Cash to park" value={i.cash} onChange={(v) => setIn({ cash: v ?? 0 })} />
          </label>
          <label className="order-row">
            <span>Skip bonuses under</span>
            <MoneyInput ariaLabel="Minimum bonus" value={i.minBonus} onChange={(v) => setIn({ minBonus: v ?? 0 })} />
          </label>
        </div>
        <label className="field">
          Split a paycheck across up to
          <Segmented ariaLabel="Max splits" value={i.maxSplits} onChange={(maxSplits) => setIn({ maxSplits })}
            options={[1, 2, 3, 4].map((n) => ({ value: n, label: `${n}` }))} />
        </label>
        <label className="field">
          Open accounts ahead of payday by
          <Segmented ariaLabel="Lead days" value={i.leadDays} onChange={(leadDays) => setIn({ leadDays })}
            options={[3, 7, 14].map((n) => ({ value: n, label: `${n} days` }))} />
        </label>
        <Check checked={i.noHardPull} onChange={(noHardPull) => setIn({ noHardPull })}>Avoid hard credit pulls</Check>
        <Check checked={i.online} onChange={(online) => setIn({ online })}>Online only (no branch visits)</Check>
        <Check checked={i.noChexSensitive} onChange={(noChexSensitive) => setIn({ noChexSensitive })}>Skip ChexSystems-sensitive banks</Check>
        <Check checked={i.business} onChange={(business) => setIn({ business })}>Include business accounts</Check>
        <Check checked={i.includeDatePassed} onChange={(includeDatePassed) => setIn({ includeDatePassed })}>Include deals past their listed end date</Check>
        <div className="field">
          Leave out these banks
          <BankPicker banks={banks} value={i.excludeBanks} onChange={(excludeBanks) => setIn({ excludeBanks })} placeholder="Pick banks to leave out" ariaLabel="Banks to leave out" />
          <span className="hint">Banks in “Banks I have” are always left out.</span>
        </div>
      </div>

      <section className="section">
        <h2>What changes</h2>
        <ul className="changes">
          {preview.lines.map((l, n) => <li key={n} className={l.tone}>{l.text}</li>)}
        </ul>
      </section>
    </Sheet>
  );
}
