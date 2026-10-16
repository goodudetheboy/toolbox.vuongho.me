import { useEffect, useRef } from 'react';
import type { Deal } from '../lib/types';
import type { FeePlan } from '../lib/value';
import { cameFromApp } from '../lib/router';
import { ActionCard, DealHero, DealSections, KeyStats } from './DealDetail';

// The page behind stays still while any sheet is open. A count, not a saved
// value per sheet: stacked sheets that close together (back gesture, tab
// switch) could otherwise restore in the wrong order and leave it locked.
let openSheets = 0;
function lockScroll(on: boolean) {
  openSheets = Math.max(0, openSheets + (on ? 1 : -1));
  document.body.style.overflow = openSheets ? 'hidden' : '';
}

/**
 * A centered dialog on desktop, a bottom sheet on phones. Sheets can stack (a
 * deal opened from a strategy); Esc closes only the top one.
 */
export function Sheet({ label, bar, foot, onClose, children }: {
  label: string;
  bar?: React.ReactNode;
  foot?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const sheets = document.querySelectorAll('.sheet-backdrop');
      if (e.key === 'Escape' && sheets[sheets.length - 1] === backdropRef.current) closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    lockScroll(true);
    boxRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      lockScroll(false);
    };
  }, []);

  // Phones: drag the sheet down to close it, from the grabber/top bar any
  // time, or from the content once it's scrolled to the top.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let startY = 0;
    let startT = 0;
    let dy = 0;
    let state: 'idle' | 'maybe' | 'drag' | 'scroll' = 'idle';
    const body = () => box.querySelector<HTMLElement>('.sheet-body');
    const onStart = (e: TouchEvent) => {
      if (!window.matchMedia('(max-width: 700px)').matches || e.touches.length !== 1) return;
      const t = e.target as HTMLElement;
      // Leave sliders, text boxes and the footer's buttons alone.
      if (t.closest('input, textarea, select, .sheet-foot')) return;
      const inBody = body()?.contains(t);
      if (inBody && (body()!.scrollTop > 0)) { state = 'scroll'; return; }
      startY = e.touches[0].clientY;
      startT = e.timeStamp;
      dy = 0;
      state = 'maybe';
    };
    const onMove = (e: TouchEvent) => {
      if (state !== 'maybe' && state !== 'drag') return;
      dy = e.touches[0].clientY - startY;
      if (state === 'maybe') {
        if (dy < -4) { state = 'scroll'; return; }
        if (dy < 6) return;
        state = 'drag';
        box.style.transition = 'none';
      }
      e.preventDefault();
      box.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };
    const onEnd = (e: TouchEvent) => {
      if (state !== 'drag') { state = 'idle'; return; }
      state = 'idle';
      const fast = dy / Math.max(1, e.timeStamp - startT) > 0.6;
      box.style.transition = 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)';
      if (dy > box.offsetHeight * 0.25 || (fast && dy > 30)) {
        box.style.transform = 'translateY(100%)';
        window.setTimeout(() => closeRef.current(), 180);
      } else {
        box.style.transform = '';
      }
    };
    box.addEventListener('touchstart', onStart, { passive: true });
    box.addEventListener('touchmove', onMove, { passive: false });
    box.addEventListener('touchend', onEnd);
    box.addEventListener('touchcancel', onEnd);
    return () => {
      box.removeEventListener('touchstart', onStart);
      box.removeEventListener('touchmove', onMove);
      box.removeEventListener('touchend', onEnd);
      box.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return (
    <div ref={backdropRef} className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={boxRef} className="sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <div className="sheet-grabber" aria-hidden="true" />
        <div className="sheet-bar">
          <span className="sheet-bar-left">{bar}</span>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body">{children}</div>
        {foot && <div className="sheet-foot">{foot}</div>}
      </div>
    </div>
  );
}

export function DealModal({ deal, today, baselineApy, fee, actions, onClose, onFullPage }: {
  deal: Deal;
  today: string;
  baselineApy: number;
  /** Opened from a strategy: how that plan handles the fee. */
  fee?: FeePlan;
  actions?: React.ReactNode;
  onClose: () => void;
  onFullPage: () => void;
}) {
  return (
    <Sheet
      label={deal.title}
      onClose={onClose}
      bar={<button type="button" className="btn ghost small" onClick={onFullPage}>Open full page</button>}
      foot={actions}
    >
      <DealHero deal={deal} today={today} baselineApy={baselineApy} fee={fee} />
      <KeyStats deal={deal} baselineApy={baselineApy} />
      <DealSections deal={deal} today={today} baselineApy={baselineApy} fee={fee} />
      <div className="sheet-links">
        {deal.url && <a href={deal.url} target="_blank" rel="noreferrer">Read the post on Doctor of Credit ↗</a>}
        {deal.offerLink && <a href={deal.offerLink} target="_blank" rel="noreferrer">Bank’s offer page ↗</a>}
      </div>
    </Sheet>
  );
}

export function DealPage({ deal, today, baselineApy, actions, onBack }: {
  deal: Deal | null;
  today: string;
  baselineApy: number;
  actions?: React.ReactNode;
  onBack: () => void;
}) {
  const back = () => (cameFromApp() ? window.history.back() : onBack());
  return (
    <div className="deal-page">
      <button type="button" className="back" onClick={back}>← Deals</button>
      {deal ? (
        <div className="layout">
          <div className="layout-main">
            <DealHero deal={deal} today={today} baselineApy={baselineApy} />
            <KeyStats deal={deal} baselineApy={baselineApy} />
            <DealSections deal={deal} today={today} baselineApy={baselineApy} full />
          </div>
          <aside className="layout-side">
            <div className="sticky">
              <ActionCard deal={deal} today={today} baselineApy={baselineApy} actions={actions} />
            </div>
          </aside>
          <div className="mobile-cta">{actions}</div>
        </div>
      ) : (
        <div className="empty">This deal isn’t on Doctor of Credit’s list anymore. It may have ended.</div>
      )}
    </div>
  );
}
