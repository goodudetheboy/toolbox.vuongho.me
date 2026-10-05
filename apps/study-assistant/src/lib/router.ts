import { useCallback, useEffect, useState } from 'react';

// Tiny History-API router (same shape as pdf-redactor's and trip-planner's — the
// apps share no code). Firebase Hosting rewrites every `/study-assistant/**`
// miss to this app's index.html, so deep links survive a reload.

export type Route =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'note'; noteId: string }
  | { name: 'chunk'; noteId: string; index: number }
  | { name: 'edit'; noteId: string; index: number };

const BASE = import.meta.env.BASE_URL; // "/study-assistant/"

export function routePath(route: Route): string {
  switch (route.name) {
    case 'home':
      return BASE;
    case 'new':
      return `${BASE}new`;
    case 'note':
      return `${BASE}n/${encodeURIComponent(route.noteId)}`;
    case 'chunk':
      return `${BASE}n/${encodeURIComponent(route.noteId)}/${route.index + 1}`;
    case 'edit':
      return `${BASE}n/${encodeURIComponent(route.noteId)}/${route.index + 1}/edit`;
  }
}

export function parseRoute(pathname: string): Route {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname.replace(/^\//, '');
  const parts = rest.split('/').filter(Boolean);
  if (parts.length === 1 && parts[0] === 'new') return { name: 'new' };
  if (parts[0] === 'n' && parts[1]) {
    const noteId = decodeURIComponent(parts[1]);
    const n = Number.parseInt(parts[2] ?? '', 10);
    if (parts.length === 3 && n > 0) return { name: 'chunk', noteId, index: n - 1 };
    if (parts.length === 4 && n > 0 && parts[3] === 'edit') return { name: 'edit', noteId, index: n - 1 };
    if (parts.length === 2) return { name: 'note', noteId };
  }
  return { name: 'home' };
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((next: Route, options: { replace?: boolean } = {}) => {
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

  /** In-app back arrow: real history.back() when the previous entry is ours, else go to `fallback`. */
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
