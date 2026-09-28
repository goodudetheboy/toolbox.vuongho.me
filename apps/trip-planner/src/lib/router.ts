import { useCallback, useEffect, useState } from 'react';

// Tiny History-API router — five routes don't justify react-router. Paths are
// relative to Vite's `base` (`/trip-planner/`); Firebase Hosting rewrites every
// `/trip-planner/**` miss to this app's index.html so deep links survive a reload.

export type TripMode = 'view' | 'edit' | 'share';

export type Route =
  | { name: 'list' }
  | { name: 'create' }
  | { name: 'trip'; tripId: string; mode: TripMode }
  | { name: 'notFound' };

const BASE = import.meta.env.BASE_URL; // "/trip-planner/"

export function routePath(route: Route): string {
  switch (route.name) {
    case 'list':
    case 'notFound':
      return BASE;
    case 'create':
      return `${BASE}new`;
    case 'trip': {
      const id = encodeURIComponent(route.tripId);
      return route.mode === 'view' ? `${BASE}trips/${id}` : `${BASE}trips/${id}/${route.mode}`;
    }
  }
}

export function parseRoute(pathname: string): Route {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname.replace(/^\//, '');
  const parts = rest.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'list' };
  if (parts.length === 1 && parts[0] === 'new') return { name: 'create' };
  if (parts[0] === 'trips' && parts[1]) {
    const tripId = decodeURIComponent(parts[1]);
    if (parts.length === 2) return { name: 'trip', tripId, mode: 'view' };
    if (parts.length === 3 && (parts[2] === 'edit' || parts[2] === 'share')) {
      return { name: 'trip', tripId, mode: parts[2] };
    }
  }
  return { name: 'notFound' };
}

/**
 * Share links used to be `?trip=<id>[&edit=<token>]` on the app root. Rewrite
 * those in place to `/trips/<id>[?edit=<token>]` so old links keep working.
 * Call once, before the first render reads the URL.
 */
export function migrateLegacyTripQuery(): void {
  const url = new URL(window.location.href);
  const tripId = url.searchParams.get('trip');
  if (!tripId) return;
  url.searchParams.delete('trip');
  url.pathname = routePath({ name: 'trip', tripId, mode: 'view' });
  window.history.replaceState(window.history.state, '', url.toString());
}

interface NavigateOptions {
  replace?: boolean;
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
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
   * "Back"/"Cancel"/"Done" buttons: pop history when the previous entry is ours
   * (so the browser back button doesn't then land on a duplicate), otherwise
   * — e.g. the page was opened directly on `/trips/x/edit` — replace with `fallback`.
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
