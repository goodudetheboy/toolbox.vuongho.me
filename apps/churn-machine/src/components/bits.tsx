// Small shared pieces.
import { useState } from 'react';
import type { Deal } from '../lib/types';
import { dealStatus, type Verdict } from '../lib/value';
import { daysBetween, shortDate } from '../lib/dates';
import { STATE_NAMES } from '../lib/states';

export function StatusTag({ deal, today }: { deal: Deal; today: string }) {
  const s = dealStatus(deal, today);
  switch (s) {
    case 'ended': return <span className="tag bad">Ended</span>;
    case 'date-passed': return <span className="tag warn">End date passed</span>;
    case 'no-date': return <span className="tag">No end date</span>;
    case 'ending-soon': {
      const days = daysBetween(today, deal.expires!);
      return <span className="tag warn">{days === 0 ? 'Ends today' : `Ends ${shortDate(deal.expires!, today)}`}</span>;
    }
    case 'active': return <span className="tag">Ends {shortDate(deal.expires!, today)}</span>;
  }
}

const VERDICT_LABEL: Record<Verdict, string> = { great: 'Great', good: 'Good', ok: 'OK', skip: 'Meh' };
export function VerdictTag({ verdict }: { verdict: Verdict }) {
  return <span className="tag"><span className={`dot v-${verdict}`} />{VERDICT_LABEL[verdict]}</span>;
}

export function MoneyInput({ value, onChange, placeholder, ariaLabel }: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <span className="money-input">
      <span>$</span>
      <input
        className="input"
        inputMode="numeric"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value == null ? '' : value.toLocaleString('en-US')}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, '');
          onChange(digits ? Number(digits) : null);
        }}
      />
    </span>
  );
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, ariaLabel }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <span className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </span>
  );
}

export function StateSelect({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <select className="input" aria-label="Your state" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">All states</option>
      {Object.entries(STATE_NAMES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
    </select>
  );
}

/** A "More …" toggle that reveals its children. */
export function Disclosure({ label, children, defaultOpen = false }: { label: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <button type="button" className="more" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} {label}
      </button>
      {open && children}
    </>
  );
}
