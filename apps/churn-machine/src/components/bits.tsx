// Small shared pieces.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Deal } from '../lib/types';
import { dealStatus, usd, type Verdict } from '../lib/value';
import { daysBetween, shortDate } from '../lib/dates';
import { STATE_NAMES } from '../lib/states';
import { PAY_FREQ_LABELS, requirementOf, rollPayday, type PayFreq } from '../lib/planner';
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

export function Check({ checked, onChange, children, disabled = false }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`check ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
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

/**
 * Paycheck amount, when you're paid, and (every 2 weeks only) your next payday.
 * On the 1st and 15th the next payday is known, so it's just shown.
 */
export function PaycheckRows({ paycheck, payFreq, firstPayday, today, onChange, beforePayday }: {
  paycheck: number;
  payFreq: PayFreq;
  firstPayday: string;
  today: string;
  onChange: (patch: { paycheck?: number; payFreq?: PayFreq; firstPayday?: string }) => void;
  /** A row to put just above "Next payday" (the plan's start date). */
  beforePayday?: React.ReactNode;
}) {
  return (
    <>
      <label className="order-row">
        <span>Paycheck</span>
        <MoneyInput ariaLabel="Paycheck amount" value={paycheck} onChange={(v) => onChange({ paycheck: v ?? 0 })} />
      </label>
      <div className="order-row">
        <span>Paid</span>
        <Segmented<PayFreq>
          ariaLabel="Pay schedule"
          value={payFreq}
          onChange={(f) => onChange({ payFreq: f, firstPayday: rollPayday(firstPayday, today, f) })}
          options={(Object.keys(PAY_FREQ_LABELS) as PayFreq[]).map((f) => ({ value: f, label: PAY_FREQ_LABELS[f] }))}
        />
      </div>
      {beforePayday}
      {payFreq === 'biweekly' ? (
        <label className="order-row">
          <span>Next payday</span>
          <input className="input" type="date" value={firstPayday} min={today} onChange={(e) => e.target.value && onChange({ firstPayday: e.target.value })} />
        </label>
      ) : (
        <div className="order-row">
          <span>Next payday</span>
          <span className="order-value">{shortDate(firstPayday, today)}</span>
        </div>
      )}
    </>
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
export function BankPicker({
  banks, value, onChange, placeholder = 'Pick banks', ariaLabel = 'Banks', allowCustom = false, removeTitle = (b) => `Show ${b} again`, tile,
}: {
  banks: string[];
  removeTitle?: (b: string) => string;
  /** How a chosen entry's tile reads (defaults to just its name). */
  tile?: (b: string) => { name?: React.ReactNode; sub?: React.ReactNode; side?: React.ReactNode };
  ariaLabel?: string;
  /** Offer "Add “typed name”" for banks that aren't in the deal data. */
  allowCustom?: boolean;
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
  const matches = banks.filter((b) => !chosen.has(bankKey(b)) && (!needle || b.toLowerCase().includes(needle)));
  const typed = q.trim();
  const custom = allowCustom && typed && !chosen.has(bankKey(typed)) && !banks.some((b) => bankKey(b) === bankKey(typed));
  const opts = custom ? [...matches, typed] : matches;
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
          aria-label={ariaLabel}
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
                {custom && i === opts.length - 1 ? <>Add “{b}”</> : b}
              </li>
            ))}
          </ul>
        )}
      </div>
      {value.length > 0 && (
        <>
          <ul className="picked">
            {value.map((b) => {
              const t = tile?.(b) ?? {};
              return (
                <li key={b} className="picked-tile">
                  <span className="picked-main">
                    <span className="picked-name">{t.name ?? b}</span>
                    {t.sub && <span className="picked-sub">{t.sub}</span>}
                  </span>
                  {t.side && <span className="picked-side">{t.side}</span>}
                  <button type="button" className="picked-x" aria-label={removeTitle(b)} title={removeTitle(b)} onClick={() => onChange(value.filter((x) => x !== b))}>
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
          {value.length > 1 && (
            <div className="picked-foot">
              <span>{value.length} chosen</span>
              <button type="button" className="more" onClick={() => onChange([])}>Clear all</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** "Bank · $bonus" for each deal, made unique (custom plan picker). */
function dealLabels(deals: Deal[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const d of [...deals].sort((a, b) => a.bank.localeCompare(b.bank) || (b.bonusMax ?? 0) - (a.bonusMax ?? 0))) {
    let label = `${d.bank} · ${usd(d.bonusMax ?? 0)}`;
    if (used.has(bankKey(label))) label += ` ${d.category}`;
    for (let n = 2; used.has(bankKey(label)); n++) label = `${d.bank} · ${usd(d.bonusMax ?? 0)} (${n})`;
    used.add(bankKey(label));
    out.set(d.id, label);
  }
  return out;
}

/** Pick the deals for a custom plan (by bank, showing each deal's bonus). */
export function DealPicker({ deals, value, onChange, today }: {
  deals: Deal[];
  value: string[];
  onChange: (ids: string[]) => void;
  today: string;
}) {
  const labels = useMemo(
    () => dealLabels(deals.filter((d) => dealStatus(d, today) !== 'ended' || value.includes(d.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, today],
  );
  const idOf = new Map([...labels].map(([id, l]) => [l, id]));
  const byId = new Map(deals.map((d) => [d.id, d]));
  const tile = (label: string) => {
    const d = byId.get(idOf.get(label) ?? label);
    if (!d) return { sub: 'No longer listed' };
    const req = requirementOf(d);
    const sub = [
      d.category === 'checking' || d.category === 'savings' || d.category === 'business' ? d.category[0].toUpperCase() + d.category.slice(1) : null,
      req.need > 0 ? `${usd(req.need)} direct deposit` : d.dd.required ? 'Direct deposit' : 'No direct deposit',
      req.balance > 0 ? `park ${usd(req.balance)}` : null,
      d.expires ? `ends ${shortDate(d.expires, today)}` : null,
    ].filter(Boolean).join(' · ');
    return { name: d.bank, sub, side: usd(d.bonusMax ?? 0) };
  };
  const options = [...labels].filter(([id]) => !value.includes(id)).map(([, l]) => l);
  return (
    <BankPicker
      banks={options}
      value={value.map((id) => labels.get(id) ?? id)}
      onChange={(ls) => onChange(ls.map((l) => idOf.get(l) ?? l))}
      placeholder="Search banks to add"
      ariaLabel="Deals for your plan"
      removeTitle={(b) => `Remove ${b}`}
      tile={tile}
    />
  );
}

/** Everything about which banks to leave out, shared by Deals and Plan. */
export interface Exclusion {
  /** Every bank name in the data, for the pickers. */
  banks: string[];
  signedIn: boolean;
  /** Banks you have or had (your list in My plans + accounts you opened). */
  have: string[];
  excludeHave: boolean;
  setExcludeHave: (v: boolean) => void;
  /** Extra banks to leave out, picked right here. */
  excluded: string[];
  setExcluded: (v: string[]) => void;
  /** What actually gets left out. */
  effective: string[];
  goToAccounts: () => void;
}

export function ExcludeBanks({ x }: { x: Exclusion }) {
  return (
    <div className="exclude">
      <div className="exclude-toggle">
        <Check checked={x.signedIn && x.excludeHave} disabled={!x.signedIn} onChange={x.setExcludeHave}>
          Exclude banks I already have
        </Check>
        <span className="hint">
          {x.signedIn ? (
            <>
              {x.have.length ? `${x.have.length} ${x.have.length === 1 ? 'bank' : 'banks'}` : 'None listed yet'} ·{' '}
              <button type="button" className="more" onClick={x.goToAccounts}>{x.have.length ? 'edit' : 'add them'} in My plans</button>
            </>
          ) : (
            'Sign in and list them in My plans.'
          )}
        </span>
      </div>
      <div className="field">
        Exclude banks
        <BankPicker banks={x.banks} value={x.excluded} onChange={x.setExcluded} placeholder="Pick banks to hide" ariaLabel="Banks to exclude" />
      </div>
    </div>
  );
}
