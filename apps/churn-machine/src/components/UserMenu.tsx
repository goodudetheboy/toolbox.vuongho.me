import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { StateSelect } from './bits';

/**
 * The one control on the right of the top bar: a pill with your photo and
 * first name (or "Sign in"). It opens a small menu holding your state, the
 * guide, and sign in / sign out.
 */
export function UserMenu({
  user,
  authLoading,
  state,
  onState,
  onGuide,
  guideHref,
  onSignIn,
  onSignOut,
}: {
  user: User | null;
  authLoading: boolean;
  state: string | null;
  onState: (v: string | null) => void;
  onGuide: () => void;
  guideHref: string;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const name = user?.displayName || user?.email || '';
  const first = name.split(/[\s@]/)[0] || 'You';
  const initial = first.charAt(0).toUpperCase();

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className={`user-pill ${open ? 'on' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user ? `Account menu for ${name}` : 'Menu'}
        onClick={() => setOpen(!open)}
      >
        <span className="avatar" aria-hidden="true">
          {user?.photoURL && !imgFailed ? (
            <img src={user.photoURL} alt="" referrerPolicy="no-referrer" onError={() => setImgFailed(true)} />
          ) : user ? (
            initial
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
            </svg>
          )}
        </span>
        <span className="user-name">{user ? first : authLoading ? '' : 'Sign in'}</span>
        <span className="caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="user-pop" role="menu">
          {user ? (
            <div className="user-head">
              <strong>{user.displayName || first}</strong>
              {user.email && <span>{user.email}</span>}
            </div>
          ) : (
            !authLoading && (
              <button type="button" className="btn primary user-signin" onClick={() => { setOpen(false); onSignIn(); }}>
                Sign in with Google
              </button>
            )
          )}
          <label className="user-row">
            <span>Your state</span>
            <StateSelect value={state} onChange={onState} />
          </label>
          <a
            className="user-item"
            role="menuitem"
            href={guideHref}
            onClick={(e) => {
              e.preventDefault();
              setOpen(false);
              onGuide();
            }}
          >
            How to use Churn Machine
          </a>
          {user && (
            <button type="button" className="user-item" role="menuitem" onClick={() => { setOpen(false); onSignOut(); }}>
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}

