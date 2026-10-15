import { useEffect, useState } from 'react';

// Real paths under /churn-machine/ (the root firebase.json rewrite serves
// index.html for all of them): /, /plan, /accounts, and /deal/<id> for one
// deal's full page.
export type Tab = 'deals' | 'plan' | 'accounts' | 'deal';
export interface Route {
  tab: Tab;
  /** Set on the 'deal' tab only. */
  dealId: string | null;
}
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function routeFromPath(path: string): Route {
  const rest = path.startsWith(BASE) ? path.slice(BASE.length) : path;
  const deal = rest.match(/^\/deal\/([^/]+)/);
  if (deal) return { tab: 'deal', dealId: decodeURIComponent(deal[1]) };
  if (rest.startsWith('/plan')) return { tab: 'plan', dealId: null };
  if (rest.startsWith('/accounts')) return { tab: 'accounts', dealId: null };
  return { tab: 'deals', dealId: null };
}

export function hrefFor(tab: Tab, dealId?: string | null): string {
  if (tab === 'deal') return `${BASE}/deal/${encodeURIComponent(dealId ?? '')}`;
  return tab === 'deals' ? `${BASE}/` : `${BASE}/${tab}`;
}

export function useRoute(): [Route, (tab: Tab, dealId?: string | null) => void] {
  const [route, setRoute] = useState<Route>(() => routeFromPath(window.location.pathname));
  useEffect(() => {
    const onPop = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = (tab: Tab, dealId: string | null = null) => {
    const href = hrefFor(tab, dealId);
    if (href !== window.location.pathname) window.history.pushState({ inApp: true }, '', href);
    setRoute({ tab, dealId: tab === 'deal' ? dealId : null });
    window.scrollTo(0, 0);
  };
  return [route, go];
}

/** True when the previous history entry is this app (so "back" stays in it). */
export const cameFromApp = () => !!(window.history.state as { inApp?: boolean } | null)?.inApp;
