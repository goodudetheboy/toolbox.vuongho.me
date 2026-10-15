import { useState } from 'react';
import { hrefFor, useTab, type Tab } from './lib/router';
import { useDeals } from './lib/useDeals';
import { signInWithGoogle, signOutUser, useAuth } from './lib/auth';
import { saveStrategy, trackDeal, useAccounts } from './lib/accounts';
import { usePersisted } from './lib/settings';
import { shortDate, todayIso } from './lib/dates';
import type { Deal } from './lib/types';
import { DealsView } from './components/DealsView';
import { PlanView } from './components/PlanView';
import { AccountsView } from './components/AccountsView';
import { StateSelect } from './components/bits';
import { UpdateToast } from './components/UpdateToast';

const TABS: { tab: Tab; label: string }[] = [
  { tab: 'deals', label: 'Deals' },
  { tab: 'plan', label: 'Plan' },
  { tab: 'accounts', label: 'My accounts' },
];

export default function App() {
  const [tab, go] = useTab();
  const { data, error } = useDeals();
  const { user, loading: authLoading } = useAuth();
  const acc = useAccounts(user?.uid ?? null);
  const [prefs, setPrefs] = usePersisted('prefs', { state: null as string | null, baselineApy: 0.04 });
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
        <h1>Churn Machine</h1>
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
            className={tab === t.tab ? 'on' : ''}
            onClick={(e) => {
              e.preventDefault();
              go(t.tab);
            }}
          >
            {t.label}
          </a>
        ))}
      </nav>

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
      ) : tab === 'deals' ? (
        <DealsView
          deals={data.deals}
          today={today}
          state={prefs.state}
          baselineApy={prefs.baselineApy}
          setBaselineApy={(baselineApy) => setPrefs({ ...prefs, baselineApy })}
          trackAction={trackAction}
        />
      ) : (
        <PlanView
          deals={data.deals}
          today={today}
          state={prefs.state}
          baselineApy={prefs.baselineApy}
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

      <UpdateToast />
      {data && (
        <footer className="footer">
          Deals from Doctor of Credit’s{' '}
          <a href={data.source} target="_blank" rel="noreferrer">Best Bank Account Bonuses</a>
          {' '}(updated {shortDate(data.sourceUpdated.slice(0, 10), today)}, checked {shortDate(data.fetchedAt.slice(0, 10), today)}).
          {' '}Always read the full post before opening an account.
        </footer>
      )}
    </div>
  );
}
