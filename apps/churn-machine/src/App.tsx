import { useCallback, useEffect, useMemo, useState } from 'react';
import { hrefFor, useRoute, type Tab } from './lib/router';
import { useDeals } from './lib/useDeals';
import { signInWithGoogle, signOutUser, useAuth } from './lib/auth';
import { saveStrategy, trackDeal, useAccounts } from './lib/accounts';
import { usePersisted } from './lib/settings';
import { shortDate, todayIso } from './lib/dates';
import type { Deal } from './lib/types';
import { bankNames } from './lib/filters';
import { DealsView } from './components/DealsView';
import { PlanView } from './components/PlanView';
import { AccountsView } from './components/AccountsView';
import { StateSelect } from './components/bits';
import { UpdateToast } from './components/UpdateToast';
import { DealModal, DealPage } from './components/DealModal';

const TABS: { tab: Tab; key: string; label: string }[] = [
  { tab: 'deals', key: '1', label: 'Deals' },
  { tab: 'plan', key: '2', label: 'Plan' },
  { tab: 'accounts', key: '3', label: 'My accounts' },
];

export default function App() {
  const [route, go] = useRoute();
  const tab = route.tab;
  const { data, error } = useDeals();
  const { user, loading: authLoading } = useAuth();
  const acc = useAccounts(user?.uid ?? null);
  const [prefs, setPrefs] = usePersisted('prefs', { state: null as string | null, baselineApy: 0.04, excludedBanks: [] as string[] });
  const [modalId, setModalId] = useState<string | null>(null);
  const closeModal = useCallback(() => setModalId(null), []);
  const banks = useMemo(() => (data ? bankNames(data.deals) : []), [data]);
  const dealById = (id: string | null) => (id && data?.deals.find((d) => d.id === id)) || null;
  const modalDeal = dealById(modalId);
  const openDeal = (d: Deal) => setModalId(d.id);
  useEffect(closeModal, [route.tab, route.dealId, closeModal]);
  const setExcluded = (excludedBanks: string[]) => setPrefs({ ...prefs, excludedBanks });
  const [busy, setBusy] = useState<string | null>(null);
  const today = todayIso();

  const signIn = () => signInWithGoogle().catch(() => {});
  const trackedDealIds = new Set(acc.accounts.map((a) => a.dealId).filter(Boolean));

  const trackAction = (d: Deal) => {
    if (!user) return <button type="button" className="btn small" onClick={signIn}>Sign in to track</button>;
    if (trackedDealIds.has(d.id)) return <span className="tag good">✓ Tracking this</span>;
    return (
      <button
        type="button"
        className="btn small"
        disabled={busy === d.id}
        onClick={async () => {
          setBusy(d.id);
          try {
            await trackDeal(user.uid, d);
          } catch (e) {
            alert(`Couldn’t save: ${(e as Error).message}`);
          } finally {
            setBusy(null);
          }
        }}
      >
        I opened this
      </button>
    );
  };

  return (
    <div className="app">
      <header className="top">
        <a className="home" href="/" aria-label="Back to toolbox">← <span className="home-label">Toolbox</span></a>
        <h1>Churn Machine <span className="go">&lt;GO&gt;</span></h1>
        <span className="spacer" />
        <StateSelect value={prefs.state} onChange={(state) => setPrefs({ ...prefs, state })} />
        {user ? (
          <button type="button" className="btn quiet small" title={user.email ?? ''} onClick={() => signOutUser()}>Sign out</button>
        ) : (
          !authLoading && <button type="button" className="btn small" onClick={signIn}>Sign in</button>
        )}
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <a
            key={t.tab}
            href={hrefFor(t.tab)}
            className={tab === t.tab || (tab === 'deal' && t.tab === 'deals') ? 'on' : ''}
            onClick={(e) => {
              e.preventDefault();
              go(t.tab);
            }}
          >
            <span className="fkey">{t.key}</span>{t.label}
          </a>
        ))}
      </nav>

      <main className="main">
      {tab === 'accounts' ? (
        <AccountsView
          user={user}
          authLoading={authLoading}
          accounts={acc.accounts}
          strategies={acc.strategies}
          loading={acc.loading}
          error={acc.error}
          today={today}
        />
      ) : error ? (
        <div className="notice">Couldn’t load the deals ({error}). Try reloading.</div>
      ) : !data ? (
        <div className="empty">Loading deals…</div>
      ) : tab === 'deal' ? (
        <DealPage
          deal={dealById(route.dealId)}
          today={today}
          baselineApy={prefs.baselineApy}
          actions={dealById(route.dealId) && trackAction(dealById(route.dealId)!)}
          onBack={() => go('deals')}
        />
      ) : tab === 'deals' ? (
        <DealsView
          deals={data.deals}
          today={today}
          state={prefs.state}
          baselineApy={prefs.baselineApy}
          setBaselineApy={(baselineApy) => setPrefs({ ...prefs, baselineApy })}
          excludedBanks={prefs.excludedBanks}
          setExcludedBanks={setExcluded}
          banks={banks}
          onOpenDeal={openDeal}
        />
      ) : (
        <PlanView
          deals={data.deals}
          today={today}
          state={prefs.state}
          baselineApy={prefs.baselineApy}
          excludedBanks={prefs.excludedBanks}
          setExcludedBanks={setExcluded}
          banks={banks}
          onOpenDeal={openDeal}
          trackedBanks={acc.accounts.filter((a) => a.status !== 'planned').map((a) => a.bank)}
          signedIn={!!user}
          onSave={async (s, inputs) => {
            if (!user) {
              await signIn();
              return;
            }
            try {
              await saveStrategy(user.uid, s, inputs);
              go('accounts');
            } catch (e) {
              alert(`Couldn’t save the plan: ${(e as Error).message}`);
            }
          }}
        />
      )}

      {data && (
        <footer className="footer">
          Deals from Doctor of Credit’s{' '}
          <a href={data.source} target="_blank" rel="noreferrer">Best Bank Account Bonuses</a>
          {' '}(updated {shortDate(data.sourceUpdated.slice(0, 10), today)}, checked {shortDate(data.fetchedAt.slice(0, 10), today)}).
          {' '}Always read the full post before opening an account.
        </footer>
      )}
      </main>

      {modalDeal && (
        <DealModal
          deal={modalDeal}
          today={today}
          baselineApy={prefs.baselineApy}
          actions={trackAction(modalDeal)}
          onClose={closeModal}
          onFullPage={() => {
            setModalId(null);
            go('deal', modalDeal.id);
          }}
        />
      )}
      <UpdateToast />
    </div>
  );
}
