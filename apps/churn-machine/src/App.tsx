import { useCallback, useEffect, useMemo, useState } from 'react';
import { cameFromApp, hrefFor, useRoute, type Tab } from './lib/router';
import { useDeals } from './lib/useDeals';
import { signInWithGoogle, signOutUser, useAuth } from './lib/auth';
import { allBanksIHave, saveStrategy, useAccounts } from './lib/accounts';
import { usePersisted } from './lib/settings';
import { todayIso } from './lib/dates';
import type { Deal } from './lib/types';
import { bankNames } from './lib/filters';
import { DealsView } from './components/DealsView';
import { PlanView } from './components/PlanView';
import { AccountsView } from './components/AccountsView';
import { type Exclusion } from './components/bits';
import { UserMenu } from './components/UserMenu';
import { UpdateToast } from './components/UpdateToast';
import { DealModal, DealPage } from './components/DealModal';
import { GuidePage } from './components/GuidePage';
import { AccountsIcon, DealsIcon, LogoMark, PlanIcon } from './components/icons';

const TABS: { tab: Tab; label: string; Icon: () => JSX.Element }[] = [
  { tab: 'deals', label: 'Deals', Icon: DealsIcon },
  { tab: 'plan', label: 'Plan', Icon: PlanIcon },
  { tab: 'accounts', label: 'My plans', Icon: AccountsIcon },
];

function oldPicks(): string[] {
  try {
    const picks = JSON.parse(localStorage.getItem('churn-machine:plan-inputs') ?? '{}').picks;
    return Array.isArray(picks) ? picks : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [route, go] = useRoute();
  const tab = route.tab;
  const isOn = (t: Tab) => tab === t || (tab === 'deal' && t === 'deals');
  const { data, error } = useDeals();
  const { user, loading: authLoading } = useAuth();
  const acc = useAccounts(user?.uid ?? null);
  const [prefs, setPrefs] = usePersisted('prefs', { state: null as string | null, baselineApy: 0.04, excludedBanks: [] as string[], excludeHave: true });
  // The custom plan's deals. Lives here so a deal's modal can add to it
  // (it used to sit inside the Plan form's saved inputs, so start from those).
  const [picks, setPicks] = usePersisted<string[]>('plan-picks', oldPicks());
  const [modalId, setModalId] = useState<string | null>(null);
  const closeModal = useCallback(() => setModalId(null), []);
  const banks = useMemo(() => (data ? bankNames(data.deals) : []), [data]);
  const dealById = (id: string | null) => (id && data?.deals.find((d) => d.id === id)) || null;
  const modalDeal = dealById(modalId);
  const openDeal = (d: Deal) => setModalId(d.id);
  useEffect(closeModal, [route.tab, route.dealId, route.strategyId, route.savedId, closeModal]);
  const today = todayIso();

  const signIn = () => signInWithGoogle().catch(() => {});
  const have = user ? allBanksIHave(acc.banksIHave, acc.accounts) : [];
  const exclusion: Exclusion = {
    banks,
    signedIn: !!user,
    have,
    excludeHave: prefs.excludeHave,
    setExcludeHave: (excludeHave) => setPrefs({ ...prefs, excludeHave }),
    excluded: prefs.excludedBanks,
    setExcluded: (excludedBanks) => setPrefs({ ...prefs, excludedBanks }),
    effective: [...prefs.excludedBanks, ...(prefs.excludeHave ? have : [])],
    goToAccounts: () => go('accounts'),
  };

  const pickAction = (d: Deal) => {
    if (!picks.includes(d.id)) {
      return <button type="button" className="btn primary block" onClick={() => setPicks([...picks, d.id])}>Add to custom plan</button>;
    }
    return (
      <div className="picked-action">
        <span className="tracking">✓ In your custom plan</span>
        <span className="picked-action-buttons">
          <button type="button" className="btn ghost small" onClick={() => go('plan', 'custom')}>Build plan</button>
          <button type="button" className="btn quiet small" onClick={() => setPicks(picks.filter((id) => id !== d.id))}>Remove</button>
        </span>
      </div>
    );
  };

  return (
    <div className="app">
      <header className="top">
        <div className="top-inner">
          <a className="home" href="/" aria-label="Back to toolbox">←</a>
          <a
            className="brand"
            href={hrefFor('deals')}
            onClick={(e) => {
              e.preventDefault();
              go('deals');
            }}
          >
            <LogoMark /> <span>Churn Machine</span>
          </a>
          <nav className="nav">
            {TABS.map((t) => (
              <a
                key={t.tab}
                href={hrefFor(t.tab)}
                className={isOn(t.tab) ? 'on' : ''}
                onClick={(e) => {
                  e.preventDefault();
                  go(t.tab);
                }}
              >
                {t.label}
              </a>
            ))}
          </nav>
          <span className="spacer" />
          <UserMenu
            user={user}
            authLoading={authLoading}
            state={prefs.state}
            onState={(state) => setPrefs({ ...prefs, state })}
            guideHref={hrefFor('guide')}
            onGuide={() => go('guide')}
            onSignIn={signIn}
            onSignOut={() => signOutUser()}
          />
        </div>
      </header>

      {/* Phone: app-style tab bar at the bottom. */}
      <nav className="tabbar">
        {TABS.map((t) => (
          <a
            key={t.tab}
            href={hrefFor(t.tab)}
            className={isOn(t.tab) ? 'on' : ''}
            onClick={(e) => {
              e.preventDefault();
              go(t.tab);
            }}
          >
            <t.Icon />
            <span>{t.label}</span>
          </a>
        ))}
      </nav>

      <main className="main">
      {tab === 'guide' ? (
        <GuidePage />
      ) : tab === 'accounts' ? (
        <AccountsView
          user={user}
          authLoading={authLoading}
          accounts={acc.accounts}
          strategies={acc.strategies}
          banksIHave={acc.banksIHave}
          banks={banks}
          deals={data?.deals ?? null}
          loading={acc.loading}
          error={acc.error}
          today={today}
          savedId={route.savedId}
          openPlan={(id) => go('accounts', id)}
          onBack={() => go('accounts')}
          onBuildPlan={() => go('plan')}
          onOpenDeal={openDeal}
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
          actions={dealById(route.dealId) && pickAction(dealById(route.dealId)!)}
          onBack={() => go('deals')}
        />
      ) : tab === 'deals' ? (
        <DealsView
          deals={data.deals}
          today={today}
          state={prefs.state}
          baselineApy={prefs.baselineApy}
          setBaselineApy={(baselineApy) => setPrefs({ ...prefs, baselineApy })}
          exclusion={exclusion}
          onOpenDeal={openDeal}
        />
      ) : (
        <PlanView
          deals={data.deals}
          dealsDate={data.fetchedAt.slice(0, 10)}
          route={route}
          openStrategy={(id, search) => go('plan', id, search)}
          closeStrategy={(fallback) => (cameFromApp() ? window.history.back() : go('plan', fallback))}
          goStep={(step) => go('plan', step)}
          picks={picks}
          setPicks={setPicks}
          today={today}
          state={prefs.state}
          baselineApy={prefs.baselineApy}
          exclusion={exclusion}
          onOpenDeal={openDeal}
          signedIn={!!user}
          onSave={async (s, inputs, apy) => {
            if (!user) {
              await signIn();
              return;
            }
            try {
              const id = await saveStrategy(user.uid, s, inputs, apy);
              go('accounts', id);
            } catch (e) {
              alert(`Couldn’t save the plan: ${(e as Error).message}`);
            }
          }}
        />
      )}
      </main>

      {modalDeal && (
        <DealModal
          deal={modalDeal}
          today={today}
          baselineApy={prefs.baselineApy}
          actions={pickAction(modalDeal)}
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
