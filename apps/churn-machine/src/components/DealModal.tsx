import { useEffect, useRef } from 'react';
import type { Deal } from '../lib/types';
import { usd, valueOf } from '../lib/value';
import { cameFromApp } from '../lib/router';
import { StatusTag, VerdictTag } from './bits';
import { DealDetail } from './DealDetail';

/** Bank, title and the key numbers in one strip (modal and full page). */
function DealHeader({ deal: d, today, baselineApy }: { deal: Deal; today: string; baselineApy: number }) {
  const v = valueOf(d, baselineApy);
  return (
    <div className="deal-head">
      <div className="deal-name">
        <span className="ticker">{d.bank}</span>
        <span className="deal-title">{d.title}</span>
      </div>
      <div className="quote">
        <div><span>Bonus</span><b>{d.bonusMax != null ? usd(d.bonusMax) : '?'}</b></div>
        <div><span>Net</span><b className={v.net > 0 ? 'up' : 'down'}>{usd(v.net)}</b></div>
        {v.effectiveApy != null && <div><span>Eff. APY</span><b>{(v.effectiveApy * 100).toFixed(1)}%</b></div>}
        <div><span>Grade</span><b><VerdictTag verdict={v.verdict} /></b></div>
        <div><span>Status</span><b><StatusTag deal={d} today={today} /></b></div>
      </div>
    </div>
  );
}

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
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={boxRef} className="modal" role="dialog" aria-modal="true" aria-label={deal.title} tabIndex={-1}>
        <div className="modal-bar">
          <span className="modal-label">Deal</span>
          <span className="grow" />
          <button type="button" className="btn small" onClick={onFullPage}>Full page ⤢</button>
          <button type="button" className="btn quiet small" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <DealHeader deal={deal} today={today} baselineApy={baselineApy} />
          <DealDetail deal={deal} today={today} baselineApy={baselineApy} actions={actions} />
        </div>
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
      <div className="toolbar">
        <button type="button" className="btn small" onClick={back}>← Back</button>
      </div>
      {deal ? (
        <>
          <DealHeader deal={deal} today={today} baselineApy={baselineApy} />
          <DealDetail deal={deal} today={today} baselineApy={baselineApy} actions={actions} full />
        </>
      ) : (
        <div className="empty">This deal isn’t on Doctor of Credit’s list anymore. It may have ended.</div>
      )}
    </div>
  );
}
