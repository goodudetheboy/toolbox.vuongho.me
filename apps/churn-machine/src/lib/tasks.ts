// What to do, and when, for a saved strategy. Tasks are derived from each
// account's planned dates; only "done" marks are stored (account.done[key]).
// Pure functions, so a future email job can reuse them as-is.
import type { Account, AccountStatus, SavedStrategy } from './accounts';
import { daysBetween, shortDate } from './dates';

export type TaskKind = 'open' | 'dd' | 'park' | 'unpark' | 'tx' | 'met' | 'bonus' | 'close';

export interface Task {
  /** Unique within its account; also the key in account.done. */
  key: string;
  kind: TaskKind;
  account: Account;
  date: string;
  title: string;
  detail: string | null;
  done: boolean;
  doneOn: string | null;
  /** Something you have to do (vs. waiting on the bank). Missed ones trigger "revise". */
  action: boolean;
  /** Done, but only optional (closing is your call). */
  optional: boolean;
}

export type TaskState = 'done' | 'overdue' | 'today' | 'upcoming';

const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const STAGE: Record<AccountStatus, number> = { planned: 0, open: 1, met: 2, paid: 3, closed: 4 };

export function tasksForAccount(a: Account, today: string): Task[] {
  const day = (iso: string) => shortDate(iso, today);
  const done = a.done ?? {};
  const stage = STAGE[a.status];
  const out: Task[] = [];
  const add = (t: Omit<Task, 'account' | 'done' | 'doneOn' | 'optional'> & { doneOn?: string | null; optional?: boolean }, isDone: boolean) =>
    out.push({ optional: false, ...t, account: a, done: isDone, doneOn: t.doneOn ?? done[t.key] ?? null });
  const opened = a.openedOn ?? a.openOn;

  if (a.openOn || a.status === 'planned') {
    const firstDd = a.deposits[0];
    add({
      key: 'open', kind: 'open', date: a.openOn ?? opened ?? '',
      title: `Open ${a.bank}`,
      detail: firstDd ? `Then switch ${money(firstDd.amount)} of your direct deposit to it before ${day(firstDd.date)}.` : null,
      action: true, doneOn: a.openedOn,
    }, stage >= 1);
  }
  for (const d of a.deposits) {
    add({
      key: `dd:${d.date}`, kind: 'dd', date: d.date,
      title: `${money(d.amount)} of your paycheck goes to ${a.bank}`,
      detail: 'Check it landed as a direct deposit.',
      action: true,
    }, stage >= 2 || !!done[`dd:${d.date}`]);
  }
  if (a.park && opened) {
    add({
      key: 'park', kind: 'park', date: opened,
      title: `Move ${money(a.park.amount)} into ${a.bank}`,
      detail: `Keep it there until ${day(a.park.until)}.`,
      action: true,
    }, stage >= 2 || !!done.park);
    add({
      key: 'unpark', kind: 'unpark', date: a.park.until,
      title: `You can move the ${money(a.park.amount)} out of ${a.bank}`,
      detail: 'Only once the bonus terms say the hold is over.',
      action: false, optional: true,
    }, !!done.unpark || stage >= 4);
  }
  if (a.transactions) {
    add({
      key: 'tx', kind: 'tx', date: a.transactionsBy ?? a.doneBy ?? opened ?? '',
      title: `Make ${a.transactions} transactions with ${a.bank}`,
      detail: 'Debit card purchases or whatever the post counts.',
      action: true,
    }, stage >= 2 || !!done.tx);
  }
  if (a.doneBy) {
    add({
      key: 'met', kind: 'met', date: a.doneBy,
      title: `Requirements done at ${a.bank}?`,
      detail: 'Mark it once every requirement is met.',
      action: false, doneOn: a.metOn,
    }, stage >= 2);
  }
  if (a.expectedPayout) {
    add({
      key: 'bonus', kind: 'bonus', date: a.expectedPayout,
      title: `${money(a.bonus)} bonus from ${a.bank} should post`,
      detail: null,
      action: false, doneOn: a.paidOn,
    }, stage >= 3);
  }
  if (a.closeAfter) {
    add({
      key: 'close', kind: 'close', date: a.closeAfter,
      title: `Safe to close ${a.bank}`,
      detail: 'Optional. Keep it if it’s free and useful.',
      action: false, optional: true, doneOn: a.closedOn,
    }, stage >= 4);
  }
  return out.filter((t) => t.date);
}

export function stateOf(t: Task, today: string): TaskState {
  if (t.done) return 'done';
  if (t.date < today) return 'overdue';
  return t.date === today ? 'today' : 'upcoming';
}

const ORDER: Record<TaskKind, number> = { open: 0, park: 1, dd: 2, tx: 3, met: 4, bonus: 5, unpark: 6, close: 7 };
export const byDate = (a: Task, b: Task) => a.date.localeCompare(b.date) || ORDER[a.kind] - ORDER[b.kind] || a.account.bank.localeCompare(b.account.bank);

export function tasksForStrategy(accounts: Account[], today: string): Task[] {
  return accounts.flatMap((a) => tasksForAccount(a, today)).sort(byDate);
}

/** Missed things you had to do: these are what "revise" fixes. */
export function neglected(tasks: Task[], today: string): Task[] {
  return tasks.filter((t) => t.action && stateOf(t, today) === 'overdue');
}

/** Late on the bank's side (bonus not posted yet, etc.). */
export function waiting(tasks: Task[], today: string): Task[] {
  return tasks.filter((t) => !t.action && !t.optional && stateOf(t, today) === 'overdue');
}

/** What marking a task done changes on its account. */
export function completeTask(t: Task, today: string, bonusReceived?: number | null): Partial<Account> {
  const a = t.account;
  const done = { ...(a.done ?? {}), [t.key]: today };
  switch (t.kind) {
    case 'open': return { status: 'open', openedOn: today };
    case 'met': return { status: 'met', metOn: today, done };
    case 'bonus': return { status: 'paid', paidOn: today, bonusReceived: bonusReceived ?? a.bonus, done };
    case 'close': return { status: 'closed', closedOn: today, done };
    default: {
      // The last requirement checked off means the account is done waiting on you.
      const patch: Partial<Account> = { done };
      if (a.status === 'planned') { patch.status = 'open'; patch.openedOn = a.openOn ?? today; }
      return patch;
    }
  }
}

export function undoTask(t: Task): Partial<Account> {
  const done = { ...(t.account.done ?? {}) };
  delete done[t.key];
  switch (t.kind) {
    case 'open': return { status: 'planned', openedOn: null };
    case 'met': return { status: 'open', metOn: null, done };
    case 'bonus': return { status: 'met', paidOn: null, bonusReceived: null, done };
    case 'close': return { status: 'paid', closedOn: null, done };
    default: return { done };
  }
}

export interface Progress {
  collected: number;
  onTheWay: number;
  planned: number;
  start: string | null;
  end: string | null;
  day: number;
  days: number;
}

export function progressOf(accounts: Account[], today: string): Progress {
  const got = (a: Account) => (a.status === 'paid' || a.status === 'closed' ? a.bonusReceived ?? a.bonus : 0);
  const starts = accounts.map((a) => a.openedOn ?? a.openOn).filter(Boolean).sort() as string[];
  const ends = accounts.map((a) => a.paidOn ?? a.expectedPayout).filter(Boolean).sort() as string[];
  const start = starts[0] ?? null;
  const end = ends.at(-1) ?? null;
  return {
    collected: accounts.reduce((t, a) => t + got(a), 0),
    onTheWay: accounts.reduce((t, a) => t + (a.status === 'open' || a.status === 'met' ? a.bonus : 0), 0),
    planned: accounts.reduce((t, a) => t + (a.status === 'paid' || a.status === 'closed' ? got(a) : a.bonus), 0),
    start,
    end,
    day: start ? Math.max(0, daysBetween(start, today) + 1) : 0,
    days: start && end ? Math.max(1, daysBetween(start, end) + 1) : 0,
  };
}

/** A strategy is finished once every account is paid or closed. */
export const isFinished = (accounts: Account[]) => accounts.length > 0 && accounts.every((a) => a.status === 'paid' || a.status === 'closed');

export const strategyAccounts = (s: SavedStrategy, accounts: Account[]) => accounts.filter((a) => a.strategyId === s.id);
