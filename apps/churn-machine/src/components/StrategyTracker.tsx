// One saved strategy, run day to day: where you are, what's due today, the
// whole plan as a timeline, and a check-in that can re-plan the rest.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Deal } from '../lib/types';
import {
  applyRevision, archiveStrategy, deleteStrategy, STATUS_LABELS, updateAccount, type Account, type SavedStrategy,
} from '../lib/accounts';
import {
  completeTask, neglected, ongoingFor, progressOf, stateOf, tasksForStrategy, undoTask, waiting, type Task,
} from '../lib/tasks';
import { planSettings, planStart, previewRevision, type PlanSettings, type RevisionPreview } from '../lib/revise';
import { OBJECTIVES, PACE_LABELS, payWhen, planStartOn, rollPayday, SPLIT_OPTIONS, splitLabel, SUGGESTED, type Objective, type Pace } from '../lib/planner';
import { addDays, monthLabel, shortDate } from '../lib/dates';
import { levelOf, usd } from '../lib/value';
import { BankPicker, Check, DealPicker, MoneyInput, PaycheckRows, Segmented } from './bits';
import { Sheet } from './DealModal';
import { AccountDetail } from './AccountsView';
import { GearIcon } from './icons';

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

export function StrategyTracker({ uid, strategy: s, accounts, deals, banks, today, alsoExclude, otherOpens, onBack, onOpenDeal }: {
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
  /** Days you opened accounts outside this plan in the last year (ChexSystems limits). */
  otherOpens: string[];
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
  const dealFor = (a: Account) => {
    const d = deals?.find((x) => x.id === a.dealId);
    return d ? levelOf(d, a.tier) : null;
  };

  // Ongoing requirements (debit purchases, eStatements...) for accounts you've opened.
  const ongoing = accounts
    .map((a) => ({ account: a, items: ongoingFor(a, dealFor(a)) }))
    .filter((x) => x.items.length > 0);
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
      <button type="button" className="back" onClick={onBack}>← My Bag</button>
      <div className="hero">
        <div className="hero-kicker">
          Today is {longToday(today)}
          {p.start && p.start > today ? ` · starts ${shortDate(p.start, today)}` : p.days ? ` · day ${Math.min(p.day, p.days)} of ${p.days}` : ''}
        </div>
        <div className="hero-title">
          <h1 className="hero-name">{s.name}</h1>
          <PlanMenu
            archived={!!s.archived}
            ready={!!deals}
            onRevise={() => deals && setRevision(previewRevision(deals, s, accounts, today, alsoExclude, undefined, otherOpens))}
            onEdit={() => setEditing(true)}
            onArchive={() => archiveStrategy(uid, s.id, !s.archived)}
            onDelete={async () => {
              if (!confirm(`Delete “${s.name}”? Accounts you never opened go with it; opened ones stay in your records.`)) return;
              await deleteStrategy(uid, s.id, accounts);
              onBack();
            }}
          />
        </div>
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          {usd(set.inputs.paycheck)} paychecks {payWhen(set.inputs.payFreq)} · {set.inputs.months} months{s.archived && ' · archived'}
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

      {ongoing.length > 0 && (
        <div className="dont-forget">
          <h3>Don’t forget</h3>
          {ongoing.map(({ account: a, items }) => (
            <div key={a.id} className="df-bank">
              {dealFor(a)
                ? <button type="button" className="bank-link df-name" onClick={() => onOpenDeal(dealFor(a)!)}>{a.bank}</button>
                : <span className="df-name">{a.bank}</span>}
              <ul>
                {items.map((x) => (
                  <li key={x.key} className={x.done ? 'done' : ''}>
                    <button
                      type="button"
                      className="task-mark"
                      aria-pressed={x.done}
                      aria-label={x.done ? `Undo: ${x.text}` : `Mark done: ${x.text}`}
                      onClick={() => {
                        const done = { ...(a.done ?? {}) };
                        if (x.done) delete done[x.key]; else done[x.key] = today;
                        save(a, { done });
                      }}
                    >
                      {x.done ? '✓' : ''}
                    </button>
                    <span>{x.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

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
            onClick={() => deals && setRevision(previewRevision(deals, s, accounts, today, alsoExclude, undefined, otherOpens))}
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

      {editing && deals && (
        <EditPlanSheet
          uid={uid}
          strategy={s}
          accounts={accounts}
          deals={deals}
          banks={banks}
          today={today}
          alsoExclude={alsoExclude}
          otherOpens={otherOpens}
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

/** The gear next to the plan's name: revise, edit settings, archive, delete. */
function PlanMenu({ archived, ready, onRevise, onEdit, onArchive, onDelete }: {
  archived: boolean;
  ready: boolean;
  onRevise: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const item = (label: string, run: () => void, disabled = false, danger = false) => (
    <button type="button" role="menuitem" className={`user-item ${danger ? 'danger' : ''}`} disabled={disabled}
      onClick={() => { setOpen(false); run(); }}>
      {label}
    </button>
  );
  return (
    <div className="plan-menu" ref={ref}>
      <button type="button" className={`icon-btn ${open ? 'on' : ''}`} aria-haspopup="menu" aria-expanded={open}
        aria-label="Manage this plan" title="Manage this plan" onClick={() => setOpen(!open)}>
        <GearIcon />
      </button>
      {open && (
        <div className="user-pop" role="menu">
          {item('Revise from today', onRevise, !ready)}
          {item('Edit settings', onEdit, !ready)}
          {item(archived ? 'Unarchive' : 'Archive', onArchive)}
          {item('Delete plan', onDelete, false, true)}
        </div>
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
      <button
        type="button"
        className="task-mark"
        aria-pressed={st === 'done'}
        aria-label={st === 'done' ? `Undo: ${t.title}` : `Mark done: ${t.title}`}
        title={st === 'done' ? 'Undo' : t.kind === 'bonus' ? 'Mark received' : 'Mark done'}
        onClick={() => (st === 'done' ? onUndo() : onDone(t.kind === 'bonus' ? Number(amount) || t.account.bonus : undefined))}
      >
        {st === 'done' ? '✓' : ''}
      </button>
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
      {t.kind === 'bonus' && st !== 'done' && !compact && (
        <div className="task-actions">
          <span className="money-input">
            <span>$</span>
            <input className="input" inputMode="numeric" aria-label="Bonus received" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
          </span>
        </div>
      )}
    </div>
  );
}

/** Change a running plan's settings; the rest of the plan is re-planned from today. */
function EditPlanSheet({ uid, strategy: s, accounts, deals, banks, today, alsoExclude, otherOpens, onClose }: {
  uid: string;
  strategy: SavedStrategy;
  accounts: Account[];
  deals: Deal[];
  banks: string[];
  today: string;
  alsoExclude: string[];
  otherOpens: string[];
  onClose: () => void;
}) {
  const original = planSettings(s);
  const start = planStart(original);
  const [draft, setDraft] = useState<PlanSettings>(() => (
    // Paychecks are on the 15th and month end; a plan saved as every 2 weeks switches when you save.
    { ...original, inputs: { ...original.inputs, payFreq: 'semimonthly', firstPayday: rollPayday(original.inputs.firstPayday, planStartOn(original.inputs, today), 'semimonthly') } }
  ));
  const [saving, setSaving] = useState(false);
  const setIn = (patch: Partial<PlanSettings['inputs']>) => {
    const inputs = { ...draft.inputs, ...patch };
    setDraft({ ...draft, inputs, endsOn: addDays(start, Math.round(inputs.months * 30.4)) });
  };
  const key = JSON.stringify(draft);
  const preview = useMemo(
    () => previewRevision(deals, s, accounts, today, alsoExclude, draft, otherOpens),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, deals, accounts, today],
  );
  const i = draft.inputs;
  const custom = draft.objective === 'custom';

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
        {custom ? (
          <div className="field">
            Deals in this plan
            <DealPicker deals={deals} value={i.picks} onChange={(picks) => setIn({ picks })} today={today} />
            <span className="hint">Accounts you’ve opened stay either way. Removing a deal you haven’t opened drops it.</span>
          </div>
        ) : (
          <div className="field">
            Goal
            <Segmented<Objective> ariaLabel="Goal" value={draft.objective} onChange={(objective) => setDraft({ ...draft, objective })}
              options={SUGGESTED.map((o) => ({ value: o, label: OBJECTIVES[o].label }))} />
            <span className="hint">{OBJECTIVES[draft.objective].hint}</span>
          </div>
        )}
        <div className="field">
          Pace
          <Segmented<Pace> ariaLabel="Pace" value={draft.pace} onChange={(pace) => setDraft({ ...draft, pace })}
            options={([1, 2, 3] as Pace[]).map((p) => ({ value: p, label: PACE_LABELS[p] }))} />
          <span className="hint">Up to {draft.pace} new {draft.pace === 1 ? 'account' : 'accounts'} a month.</span>
        </div>
        <div className="order-rows">
          <PaycheckRows paycheck={i.paycheck} firstPayday={i.firstPayday} today={planStartOn(i, today)} onChange={setIn} />
          <div className="order-row">
            <span>Plan length <span className="faint">ends ~{shortDate(draft.endsOn, today)}</span></span>
            <Segmented ariaLabel="Plan length" value={i.months} onChange={(months) => setIn({ months })}
              options={[3, 6, 9, 12].map((m) => ({ value: m, label: `${m} mo` }))} />
          </div>
          <label className="order-row">
            <span>Cash I can park</span>
            <MoneyInput ariaLabel="Cash to park" value={i.cash} onChange={(v) => setIn({ cash: v ?? 0 })} />
          </label>
          {!custom && (
            <label className="order-row">
              <span>Skip bonuses under</span>
              <MoneyInput ariaLabel="Minimum bonus" value={i.minBonus} onChange={(v) => setIn({ minBonus: v ?? 0 })} />
            </label>
          )}
        </div>
        <label className="field">
          Split a paycheck across up to
          <Segmented ariaLabel="Max splits" value={i.maxSplits} onChange={(maxSplits) => setIn({ maxSplits })}
            options={SPLIT_OPTIONS.map((n) => ({ value: n, label: splitLabel(n) }))} />
        </label>
        <label className="field">
          Open accounts ahead of payday by
          <Segmented ariaLabel="Lead days" value={i.leadDays} onChange={(leadDays) => setIn({ leadDays })}
            options={[3, 7, 14].map((n) => ({ value: n, label: `${n} days` }))} />
        </label>
        {!custom && (
          <>
            <Check checked={i.noHardPull} onChange={(noHardPull) => setIn({ noHardPull })}>Avoid hard credit pulls</Check>
            <Check checked={i.online} onChange={(online) => setIn({ online })}>Online only (no branch visits)</Check>
            <Check checked={i.noChexSensitive} onChange={(noChexSensitive) => setIn({ noChexSensitive })}>Skip ChexSystems-sensitive banks</Check>
            <Check checked={i.business} onChange={(business) => setIn({ business })}>Include business accounts</Check>
          </>
        )}
        <Check checked={i.includeDatePassed} onChange={(includeDatePassed) => setIn({ includeDatePassed })}>Include deals past their listed end date</Check>
        {!custom && (
          <div className="field">
            Leave out these banks
            <BankPicker banks={banks} value={i.excludeBanks} onChange={(excludeBanks) => setIn({ excludeBanks })} placeholder="Pick banks to leave out" ariaLabel="Banks to leave out" />
            <span className="hint">Banks in “Banks I have” are always left out.</span>
          </div>
        )}
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
