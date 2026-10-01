import { useCallback, useEffect, useState } from 'react';

// Tiny History-API router so the browser back button moves between upload,
// history and an open document. Paths are relative to Vite's `base`
// (`/pdf-redactor/`); Firebase Hosting rewrites every `/pdf-redactor/**` miss
// to this app's index.html so a reload on a deep link still works.

export type Route =
  | { name: 'upload' }
  | { name: 'history' }
  | { name: 'doc'; id: string; page: number };

const BASE = import.meta.env.BASE_URL; // "/pdf-redactor/"

export function routePath(route: Route): string {
  switch (route.name) {
    case 'upload':
      return BASE;
    case 'history':
      return `${BASE}history`;
    case 'doc': {
      const path = `${BASE}doc/${encodeURIComponent(route.id)}`;
      return route.page > 1 ? `${path}?page=${route.page}` : path;
    }
  }
}

export function parseRoute(location: Location): Route {
  const { pathname, search } = location;
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname.replace(/^\//, '');
  const parts = rest.split('/').filter(Boolean);
  if (parts.length === 1 && parts[0] === 'history') return { name: 'history' };
  if (parts.length === 2 && parts[0] === 'doc') {
    const page = Number.parseInt(new URLSearchParams(search).get('page') ?? '', 10);
    return { name: 'doc', id: decodeURIComponent(parts[1]), page: page > 0 ? page : 1 };
  }
  return { name: 'upload' };
}

interface NavigateOptions {
  replace?: boolean;
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location));

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((next: Route, options: NavigateOptions = {}) => {
    const path = routePath(next);
    if (options.replace) {
      window.history.replaceState(window.history.state, '', path);
    } else {
      // `inApp` marks entries we pushed ourselves, so `goBack` knows history.back() stays inside the app.
      window.history.pushState({ inApp: true }, '', path);
      window.scrollTo(0, 0);
    }
    setRoute(next);
  }, []);

  /**
   * In-app "Close"/"Back" buttons: pop history when the previous entry is ours
   * (so the browser back button doesn't then land on a duplicate), otherwise
   * — e.g. the page was opened directly on `/history` — replace with `fallback`.
   */
  const goBack = useCallback(
    (fallback: Route) => {
      if ((window.history.state as { inApp?: boolean } | null)?.inApp) {
        window.history.back();
      } else {
        navigate(fallback, { replace: true });
      }
    },
    [navigate],
  );

  return { route, navigate, goBack };
}
