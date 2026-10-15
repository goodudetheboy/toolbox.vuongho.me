import { useEffect, useRef } from 'react';
import type { Deal } from '../lib/types';
import { cameFromApp } from '../lib/router';
import { ActionCard, DealHero, DealSections, KeyStats } from './DealDetail';

/** A centered dialog on desktop, a bottom sheet on phones. */
export function DealModal({ deal, today, baselineApy, actions, onClose, onFullPage }: {
  deal: Deal;
  today: string;
  baselineApy: number;
  actions?: React.ReactNode;
  onClose: () => void;
  onFullPage: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    boxRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={boxRef} className="sheet" role="dialog" aria-modal="true" aria-label={deal.title} tabIndex={-1}>
        <div className="sheet-grabber" aria-hidden="true" />
        <div className="sheet-bar">
          <button type="button" className="btn ghost small" onClick={onFullPage}>Open full page</button>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body">
          <DealHero deal={deal} today={today} baselineApy={baselineApy} />
          <KeyStats deal={deal} baselineApy={baselineApy} />
          <DealSections deal={deal} today={today} baselineApy={baselineApy} />
          <div className="sheet-links">
            {deal.url && <a href={deal.url} target="_blank" rel="noreferrer">Read the post on Doctor of Credit ↗</a>}
            {deal.offerLink && <a href={deal.offerLink} target="_blank" rel="noreferrer">Bank’s offer page ↗</a>}
          </div>
        </div>
        <div className="sheet-foot">{actions}</div>
      </div>
    </div>
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
