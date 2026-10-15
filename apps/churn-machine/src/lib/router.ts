import { useEffect, useState } from 'react';

// Three real paths under /churn-machine/ (the root firebase.json rewrite serves
// index.html for all of them).
export type Tab = 'deals' | 'plan' | 'accounts';
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function tabFromPath(path: string): Tab {
  const rest = path.startsWith(BASE) ? path.slice(BASE.length) : path;
  if (rest.startsWith('/plan')) return 'plan';
  if (rest.startsWith('/accounts')) return 'accounts';
  return 'deals';
}

export function hrefFor(tab: Tab): string {
  return tab === 'deals' ? `${BASE}/` : `${BASE}/${tab}`;
}

export function useTab(): [Tab, (t: Tab) => void] {
  const [tab, setTab] = useState<Tab>(() => tabFromPath(window.location.pathname));
  useEffect(() => {
    const onPop = () => setTab(tabFromPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = (t: Tab) => {
    if (t !== tab) window.history.pushState({}, '', hrefFor(t));
    setTab(t);
    window.scrollTo(0, 0);
  };
  return [tab, go];
}
