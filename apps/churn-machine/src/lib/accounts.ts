// Your own record of accounts and the strategies they belong to, in Firestore
// (database `toolbox-churn-machine`): users/{uid}/accounts, users/{uid}/strategies,
// and users/{uid}/profile/main (the banks you already have).
// Only the signed-in owner can read or write them (firestore.rules).
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from './firebase';
import type { Deal } from './types';
import { planStartOn, type PlanInputs, type PlanItem, type Strategy } from './planner';
import { addDays, todayIso } from './dates';
import { ASSUMED, keepOpenDays } from './value';
import { bankKey } from './filters';

export type AccountStatus = 'planned' | 'open' | 'met' | 'paid' | 'closed';

export const STATUS_LABELS: Record<AccountStatus, string> = {
  planned: 'Planned',
  open: 'Open',
  met: 'Waiting on bonus',
  paid: 'Bonus received',
  closed: 'Closed',
};

export interface Account {
  id: string;
  bank: string;
  title: string;
  dealId: string | null;
  docUrl: string | null;
  bonus: number;
  status: AccountStatus;
  strategyId: string | null;
  strategyName: string | null;
  /** Planned dates (from a strategy, or estimated when tracked by hand). */
  openOn: string | null;
  doneBy: string | null;
  expectedPayout: string | null;
  closeAfter: string | null;
  deposits: { date: string; amount: number }[];
  park: { amount: number; until: string } | null;
  transactions: number | null;
  /** What actually happened. */
  openedOn: string | null;
  metOn: string | null;
  paidOn: string | null;
  bonusReceived: number | null;
  closedOn: string | null;
  notes: string;
  /** When each task was checked off (tasks.ts), by task key. */
  done?: Record<string, string>;
  transactionsBy?: string | null;
}

export interface SavedStrategy {
  id: string;
  name: string;
  paycheck: number;
  months: number;
  firstPayday: string;
  totalBonus: number;
  accounts: number;
  archived: boolean;
  /** Saved since strategy tracking (older plans lack these; see planSettings). */
  planId?: string;
  inputs?: PlanInputs;
  baselineApy?: number;
  endsOn?: string;
  revisions?: { on: string; note: string }[];
}

const accountsCol = (uid: string) => collection(db, 'users', uid, 'accounts');
const strategiesCol = (uid: string) => collection(db, 'users', uid, 'strategies');
const profileDoc = (uid: string) => doc(db, 'users', uid, 'profile', 'main');

export function useAccounts(uid: string | null) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [strategies, setStrategies] = useState<SavedStrategy[]>([]);
  const [banksIHave, setBanksIHave] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setAccounts([]);
      setStrategies([]);
      setBanksIHave([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const onErr = (e: Error) => setError(e.message);
    const unA = onSnapshot(query(accountsCol(uid), orderBy('createdAt')), (snap) => {
      setAccounts(snap.docs.map((d) => ({ ...(d.data() as Omit<Account, 'id'>), id: d.id })));
      setLoading(false);
    }, onErr);
    const unS = onSnapshot(query(strategiesCol(uid), orderBy('createdAt')), (snap) => {
      setStrategies(snap.docs.map((d) => ({ ...(d.data() as Omit<SavedStrategy, 'id'>), id: d.id })));
    }, onErr);
    const unP = onSnapshot(profileDoc(uid), (snap) => {
      setBanksIHave((snap.data()?.banksIHave as string[] | undefined) ?? []);
    }, onErr);
    return () => {
      unA();
      unS();
      unP();
    };
  }, [uid]);

  return { accounts, strategies, banksIHave, loading, error };
}

/** Banks you listed by hand in My accounts. */
export function saveBanksIHave(uid: string, banksIHave: string[]): Promise<void> {
  return setDoc(profileDoc(uid), { banksIHave, updatedAt: serverTimestamp() }, { merge: true });
}

/** Banks you have (or had): your list plus every tracked account you actually opened. */
export function allBanksIHave(listed: string[], accounts: Account[]): string[] {
  const seen = new Set(listed.map(bankKey));
  const out = [...listed];
  for (const a of accounts) {
    if (a.status === 'planned' || seen.has(bankKey(a.bank))) continue;
    seen.add(bankKey(a.bank));
    out.push(a.bank);
  }
  return out;
}

export function blankAccount(): Omit<Account, 'id' | 'bank' | 'title' | 'bonus'> {
  return {
    dealId: null, docUrl: null, status: 'open', strategyId: null, strategyName: null, openOn: null,
    doneBy: null, expectedPayout: null, closeAfter: null, deposits: [], park: null, transactions: null,
    openedOn: null, metOn: null, paidOn: null, bonusReceived: null, closedOn: null, notes: '',
  };
}

/** A planned account for one item of a strategy. */
export function accountFromItem(item: PlanItem, strategyId: string, strategyName: string): Omit<Account, 'id'> {
  return {
    ...blankAccount(),
    bank: item.deal.bank,
    title: item.deal.title,
    dealId: item.deal.id,
    docUrl: item.deal.url,
    bonus: item.value.bonus,
    status: 'planned',
    strategyId,
    strategyName,
    openOn: item.openOn,
    doneBy: item.doneBy,
    expectedPayout: item.expectedPayout,
    closeAfter: item.closeAfter,
    deposits: item.deposits,
    park: item.park ? { amount: item.park.amount, until: item.park.until } : null,
    transactions: item.deal.transactions,
    transactionsBy: item.transactionsBy,
    done: {},
  };
}

/** Saves a picked strategy plus one "planned" account per item, in one batch. */
export async function saveStrategy(uid: string, s: Strategy, inputs: PlanInputs, baselineApy: number): Promise<string> {
  const batch = writeBatch(db);
  const sRef = doc(strategiesCol(uid));
  batch.set(sRef, {
    name: s.name,
    paycheck: inputs.paycheck,
    months: inputs.months,
    firstPayday: inputs.firstPayday,
    totalBonus: s.totals.bonus,
    accounts: s.items.length,
    archived: false,
    planId: s.id,
    inputs,
    baselineApy,
    endsOn: addDays(planStartOn(inputs, todayIso()), Math.round(inputs.months * 30.4)),
    revisions: [],
    createdAt: serverTimestamp(),
  });
  for (const item of s.items) {
    batch.set(doc(accountsCol(uid)), { ...accountFromItem(item, sRef.id, s.name), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  await batch.commit();
  return sRef.id;
}

/** "I opened this" from the deals list: an open account with estimated dates. */
export async function trackDeal(uid: string, d: Deal, openedOn = todayIso()): Promise<void> {
  const doneBy = addDays(openedOn, Math.max(d.dd.windowDays ?? ASSUMED.ddWindowDays, d.balance?.holdDays ?? 0));
  const expectedPayout = addDays(doneBy, d.payoutDays ?? ASSUMED.payoutDays);
  const closeAfter = [addDays(openedOn, keepOpenDays(d)), expectedPayout].sort().at(-1)!;
  await addDoc(accountsCol(uid), {
    ...blankAccount(),
    bank: d.bank,
    title: d.title,
    dealId: d.id,
    docUrl: d.url,
    bonus: d.bonusMax ?? 0,
    openOn: openedOn,
    openedOn,
    doneBy,
    expectedPayout,
    closeAfter,
    transactions: d.transactions,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function addManualAccount(uid: string, bank: string, bonus: number, openedOn: string): Promise<void> {
  await addDoc(accountsCol(uid), {
    ...blankAccount(),
    bank,
    title: bank,
    bonus,
    openOn: openedOn,
    openedOn,
    closeAfter: addDays(openedOn, ASSUMED.keepOpenDays),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function updateAccount(uid: string, id: string, patch: Partial<Omit<Account, 'id'>>): Promise<void> {
  return updateDoc(doc(accountsCol(uid), id), { ...patch, updatedAt: serverTimestamp() });
}

export function deleteAccount(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(accountsCol(uid), id));
}

export function archiveStrategy(uid: string, id: string, archived: boolean): Promise<void> {
  return updateDoc(doc(strategiesCol(uid), id), { archived });
}

/** Writes a revision (see revise.ts) for one strategy, in one batch. */
export async function applyRevision(uid: string, strategyId: string, change: {
  update: { id: string; patch: Partial<Omit<Account, 'id'>> }[];
  remove: string[];
  add: Omit<Account, 'id'>[];
  totalBonus: number;
  accounts: number;
  revisions: { on: string; note: string }[];
  /** New settings, when the plan was edited. */
  strategy?: Partial<SavedStrategy>;
}): Promise<void> {
  const batch = writeBatch(db);
  for (const u of change.update) batch.update(doc(accountsCol(uid), u.id), { ...u.patch, updatedAt: serverTimestamp() });
  for (const id of change.remove) batch.delete(doc(accountsCol(uid), id));
  for (const a of change.add) batch.set(doc(accountsCol(uid)), { ...a, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.update(doc(strategiesCol(uid), strategyId), {
    totalBonus: change.totalBonus,
    accounts: change.accounts,
    revisions: change.revisions,
    ...change.strategy,
  });
  await batch.commit();
}

/** Deletes a strategy and the accounts in it you never opened. Opened ones stay. */
export async function deleteStrategy(uid: string, id: string, accounts: Account[]): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(strategiesCol(uid), id));
  for (const a of accounts) {
    if (a.strategyId !== id) continue;
    if (a.status === 'planned') batch.delete(doc(accountsCol(uid), a.id));
    else batch.update(doc(accountsCol(uid), a.id), { strategyId: null, strategyName: null });
  }
  await batch.commit();
}

/** The one thing to do next for an account, and when. */
export function nextStep(a: Account, today: string): { text: string; date: string | null; overdue: boolean; action: AccountStatus | null; actionLabel: string | null } {
  switch (a.status) {
    case 'planned':
      return { text: 'Open the account', date: a.openOn, overdue: !!a.openOn && a.openOn < today, action: 'open', actionLabel: 'I opened it' };
    case 'open': {
      const next = a.deposits.find((d) => d.date >= today);
      const text = next
        ? `Route $${next.amount.toLocaleString('en-US')} of your paycheck here`
        : a.park ? `Keep $${a.park.amount.toLocaleString('en-US')} parked` : 'Finish the requirements';
      const date = next?.date ?? a.park?.until ?? a.doneBy;
      return { text, date, overdue: false, action: 'met', actionLabel: 'Requirements done' };
    }
    case 'met':
      return { text: 'Bonus should post', date: a.expectedPayout, overdue: !!a.expectedPayout && a.expectedPayout < today, action: 'paid', actionLabel: 'Bonus received' };
    case 'paid': {
      const safe = !a.closeAfter || a.closeAfter <= today;
      return { text: safe ? 'Safe to close' : 'Keep open until', date: a.closeAfter, overdue: false, action: 'closed', actionLabel: 'I closed it' };
    }
    case 'closed':
      return { text: 'Done', date: a.closedOn, overdue: false, action: null, actionLabel: null };
  }
}

/** The patch that moves an account to `status`, stamping today's date. */
export function advance(a: Account, status: AccountStatus, today: string): Partial<Account> {
  switch (status) {
    case 'open': return { status, openedOn: today };
    case 'met': return { status, metOn: today };
    case 'paid': return { status, paidOn: today, bonusReceived: a.bonusReceived ?? a.bonus };
    case 'closed': return { status, closedOn: today };
    default: return { status };
  }
}
