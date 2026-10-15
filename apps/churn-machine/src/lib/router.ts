import { useEffect, useState } from 'react';

// Real paths under /churn-machine/ (the root firebase.json rewrite serves
// index.html for all of them): /, /plan, /accounts, /deal/<id> for one deal's
// full page, and /plan/<strategyId>?<inputs> for a strategy permalink
// (see planLink.ts).
export type Tab = 'deals' | 'plan' | 'accounts' | 'deal';
export interface Route {
  tab: Tab;
  /** Set on the 'deal' tab only. */
  dealId: string | null;
  /** Set on a strategy permalink (tab 'plan'). */
  strategyId: string | null;
  /** The query string, for a strategy permalink's inputs. */
  search: string;
}
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function routeFromLocation(path: string, search: string): Route {
  const rest = path.startsWith(BASE) ? path.slice(BASE.length) : path;
  const none = { dealId: null, strategyId: null, search: '' };
  const deal = rest.match(/^\/deal\/([^/]+)/);
  if (deal) return { ...none, tab: 'deal', dealId: decodeURIComponent(deal[1]) };
  const strategy = rest.match(/^\/plan\/([^/]+)/);
  if (strategy) return { ...none, tab: 'plan', strategyId: decodeURIComponent(strategy[1]), search };
  if (rest.startsWith('/plan')) return { ...none, tab: 'plan' };
  if (rest.startsWith('/accounts')) return { ...none, tab: 'accounts' };
  return { ...none, tab: 'deals' };
}

/** `id` is the deal id for 'deal', or the strategy id for 'plan'. */
export function hrefFor(tab: Tab, id?: string | null, search = ''): string {
  if (tab === 'deal') return `${BASE}/deal/${encodeURIComponent(id ?? '')}`;
  if (tab === 'plan' && id) return `${BASE}/plan/${encodeURIComponent(id)}${search ? `?${search}` : ''}`;
  return tab === 'deals' ? `${BASE}/` : `${BASE}/${tab}`;
}

export function useRoute(): [Route, (tab: Tab, id?: string | null, search?: string) => void] {
  const [route, setRoute] = useState<Route>(() => routeFromLocation(window.location.pathname, window.location.search));
  useEffect(() => {
    const onPop = () => setRoute(routeFromLocation(window.location.pathname, window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = (tab: Tab, id: string | null = null, search = '') => {
    const href = hrefFor(tab, id, search);
    if (href !== window.location.pathname + window.location.search) window.history.pushState({ inApp: true }, '', href);
    const next = routeFromLocation(new URL(href, window.location.origin).pathname, search ? `?${search}` : '');
    // Opening or closing a strategy modal keeps the page where it is.
    if (!(route.tab === 'plan' && next.tab === 'plan')) window.scrollTo(0, 0);
    setRoute(next);
  };
  return [route, go];
}

/** True when the previous history entry is this app (so "back" stays in it). */
export const cameFromApp = () => !!(window.history.state as { inApp?: boolean } | null)?.inApp;
