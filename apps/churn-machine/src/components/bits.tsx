// Small shared pieces.
import { useEffect, useRef, useState } from 'react';
import type { Deal } from '../lib/types';
import { dealStatus, type Verdict } from '../lib/value';
import { daysBetween, shortDate } from '../lib/dates';
import { STATE_NAMES } from '../lib/states';
import { bankKey } from '../lib/filters';

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

/**
 * Pick banks from a dropdown (type to narrow it, or just scroll and click).
 * Chosen banks show as removable chips.
 */
export function BankPicker({ banks, value, onChange, placeholder = 'Pick banks you already have' }: {
  banks: string[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const chosen = new Set(value.map(bankKey));
  const needle = q.trim().toLowerCase();
  const opts = banks.filter((b) => !chosen.has(bankKey(b)) && (!needle || b.toLowerCase().includes(needle)));
  const add = (b: string) => {
    onChange([...value, b]);
    setQ('');
    setHi(0);
  };

  useEffect(() => {
    listRef.current?.children[hi]?.scrollIntoView({ block: 'nearest' });
  }, [hi, open]);

  return (
    <div
      className="bank-picker"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="combo">
        <input
          ref={inputRef}
          className="input"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-label="Banks to exclude"
          placeholder={placeholder}
          value={q}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setHi(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setHi((h) => Math.min(h + 1, opts.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHi((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter' && open && opts[hi]) {
              e.preventDefault();
              add(opts[hi]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            } else if (e.key === 'Backspace' && !q && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
        />
        <button
          type="button"
          className="combo-toggle"
          aria-label={open ? 'Hide bank list' : 'Show all banks'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setOpen(!open);
            inputRef.current?.focus();
          }}
        >
          {open ? '▴' : '▾'}
        </button>
        {open && (
          <ul ref={listRef} className="combo-list" role="listbox">
            {opts.length === 0 ? (
              <li className="none">No match</li>
            ) : opts.map((b, i) => (
              <li
                key={b}
                role="option"
                aria-selected={i === hi}
                className={i === hi ? 'hi' : ''}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(b);
                }}
              >
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>
      {value.length > 0 && (
        <div className="chips" style={{ marginTop: 8 }}>
          {value.map((b) => (
            <button key={b} type="button" className="chip on" title={`Show ${b} again`} onClick={() => onChange(value.filter((x) => x !== b))}>
              {b} ✕
            </button>
          ))}
          <button type="button" className="more" onClick={() => onChange([])}>Clear all</button>
        </div>
      )}
    </div>
  );
}
