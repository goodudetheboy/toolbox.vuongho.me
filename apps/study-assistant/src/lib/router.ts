import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

// Tiny History-API router (same shape as pdf-redactor's and trip-planner's — the
// apps share no code). Firebase Hosting rewrites every `/study-assistant/**`
// miss to this app's index.html, so deep links survive a reload.

export type AdminTab = 'feedback' | 'usage';

export type Route =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'exams' }
  | { name: 'newExam'; noteId?: string }
  | { name: 'exam'; examId: string }
  | { name: 'editExam'; examId: string }
  | { name: 'admin'; tab: AdminTab }
  | { name: 'note'; noteId: string }
  | { name: 'chunk'; noteId: string; index: number }
  | { name: 'edit'; noteId: string; index: number }
  | { name: 'progress'; noteId: string; index: number };

const BASE = import.meta.env.BASE_URL; // "/study-assistant/"

export function routePath(route: Route): string {
  switch (route.name) {
    case 'home':
      return BASE;
    case 'new':
      return `${BASE}new`;
    case 'exams':
      return `${BASE}exams`;
    case 'newExam':
      return route.noteId ? `${BASE}exams/new/${encodeURIComponent(route.noteId)}` : `${BASE}exams/new`;
    case 'exam':
      return `${BASE}e/${encodeURIComponent(route.examId)}`;
    case 'editExam':
      return `${BASE}e/${encodeURIComponent(route.examId)}/edit`;
    case 'admin':
      return route.tab === 'feedback' ? `${BASE}admin` : `${BASE}admin/${route.tab}`;
    case 'note':
      return `${BASE}n/${encodeURIComponent(route.noteId)}`;
    case 'chunk':
      return `${BASE}n/${encodeURIComponent(route.noteId)}/${route.index + 1}`;
    case 'edit':
      return `${BASE}n/${encodeURIComponent(route.noteId)}/${route.index + 1}/edit`;
    case 'progress':
      return `${BASE}n/${encodeURIComponent(route.noteId)}/${route.index + 1}/progress`;
  }
}

export function parseRoute(pathname: string): Route {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname.replace(/^\//, '');
  const parts = rest.split('/').filter(Boolean);
  if (parts.length === 1 && parts[0] === 'new') return { name: 'new' };
  if (parts[0] === 'exams') {
    if (parts.length === 1) return { name: 'exams' };
    if (parts[1] === 'new' && parts.length <= 3) return parts[2] ? { name: 'newExam', noteId: decodeURIComponent(parts[2]) } : { name: 'newExam' };
  }
  if (parts[0] === 'e' && parts[1]) {
    const examId = decodeURIComponent(parts[1]);
    if (parts.length === 2) return { name: 'exam', examId };
    if (parts.length === 3 && parts[2] === 'edit') return { name: 'editExam', examId };
  }
  if (parts[0] === 'admin' && parts.length <= 2) return { name: 'admin', tab: parts[1] === 'usage' ? 'usage' : 'feedback' };
  if (parts[0] === 'n' && parts[1]) {
    const noteId = decodeURIComponent(parts[1]);
    const n = Number.parseInt(parts[2] ?? '', 10);
    if (parts.length === 3 && n > 0) return { name: 'chunk', noteId, index: n - 1 };
    if (parts.length === 4 && n > 0 && parts[3] === 'edit') return { name: 'edit', noteId, index: n - 1 };
    if (parts.length === 4 && n > 0 && parts[3] === 'progress') return { name: 'progress', noteId, index: n - 1 };
    if (parts.length === 2) return { name: 'note', noteId };
  }
  return { name: 'home' };
}

type Direction = 'forward' | 'back' | 'swap';

// Position of the current entry in our own pushes, kept in history.state so a
// popstate can tell back from forward. Entries we didn't push count as 0.
const entryIndex = () => (window.history.state as { idx?: number } | null)?.idx ?? 0;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let transitionId = 0;

/** Swap screens inside a View Transition; `html[data-nav]` picks the slide direction in styles.css. */
function transition(direction: Direction, update: () => void) {
  if (!document.startViewTransition || reducedMotion.matches) {
    update();
    return;
  }
  const id = ++transitionId;
  const root = document.documentElement;
  root.dataset.nav = direction;
  const vt = document.startViewTransition(() => flushSync(update));
  vt.finished.finally(() => {
    if (id === transitionId) delete root.dataset.nav;
  });
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const current = useRef(entryIndex());

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const next = entryIndex();
      const direction = next < current.current ? 'back' : 'forward';
      current.current = next;
      const update = () => setRoute(parseRoute(window.location.pathname));
      // iOS/Safari swipe-back already animated the page — don't slide it a second time.
      if ((e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition) update();
      else transition(direction, update);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((next: Route, options: { replace?: boolean; back?: boolean } = {}) => {
    const path = routePath(next);
    if (options.replace) {
      window.history.replaceState(window.history.state, '', path);
      transition(options.back ? 'back' : 'swap', () => setRoute(next));
      return;
    }
    // `inApp` marks entries we pushed ourselves, so `goBack` knows history.back() stays inside the app.
    const idx = entryIndex() + 1;
    window.history.pushState({ inApp: true, idx }, '', path);
    current.current = idx;
    transition('forward', () => {
      window.scrollTo(0, 0);
      setRoute(next);
    });
  }, []);

  /** In-app back arrow: real history.back() when the previous entry is ours, else go to `fallback`. */
  const goBack = useCallback(
    (fallback: Route) => {
      if ((window.history.state as { inApp?: boolean } | null)?.inApp) {
        window.history.back();
      } else {
        navigate(fallback, { replace: true, back: true });
      }
    },
    [navigate],
  );

  return { route, navigate, goBack };
}
