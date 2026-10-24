import { useEffect, useRef, useState } from 'react';
import { HINT_LIMITS } from '../lib/settings';
import { t } from '../strings';
import { Icon } from './Scrap';

const label = (n: number) => (n === Infinity ? '∞' : String(n));

/**
 * The big Practice button with the hint settings built in: the right end shows the
 * hint limit ("5 💡 ⌄") and opens a small paper menu of limits.
 */
export default function PracticeButton({
  onStart,
  hintLimit,
  onHintLimit,
}: {
  onStart: () => void;
  hintLimit: number;
  onHintLimit: (n: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="practice-split" ref={ref}>
      <button className="practice-go" onClick={onStart}>
        <Icon name="mic" size={30} /> {t.startSpeaking}
      </button>
      <button
        className="practice-hints"
        onClick={() => setOpen((o) => !o)}
        aria-label={t.hintSettings(label(hintLimit))}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="practice-hints-n">{label(hintLimit)}</span>
        <Icon name="bulb" size={22} />
        <span className={`practice-chevron ${open ? 'up' : ''}`}>
          <Icon name="chevron" size={18} />
        </span>
      </button>
      {open && (
        <div className="menu-pop practice-pop" role="menu">
          <div className="menu-title">
            <Icon name="bulb" size={18} /> {t.hintsPerTry}
          </div>
          {HINT_LIMITS.map((n) => (
            <button
              key={n}
              role="menuitemradio"
              aria-checked={hintLimit === n}
              className={`menu-item ${hintLimit === n ? 'on' : ''}`}
              onClick={() => {
                onHintLimit(n);
                setOpen(false);
              }}
            >
              <span className="menu-check">{hintLimit === n && <Icon name="check" size={18} />}</span>
              {n === Infinity ? t.noHintLimit : t.hintsCount(n)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
