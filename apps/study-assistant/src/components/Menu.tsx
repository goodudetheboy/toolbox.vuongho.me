import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../strings';
import { Icon } from './Scrap';

export interface MenuItem {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** Destructive (delete): shown in coral. */
  danger?: boolean;
}

/**
 * Round "⋯" button (same look as the back button) that drops down a small paper menu.
 * `trigger` swaps the ⋯ for another icon (and its label), e.g. the account menu's person.
 */
export default function Menu({ items, trigger }: { items: MenuItem[]; trigger?: { icon: ReactNode; label: string } }) {
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
    <div className="menu" ref={ref}>
      <button
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={trigger?.label ?? t.more}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger?.icon ?? <Icon name="dots" size={24} />}
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className={`menu-item ${it.danger ? 'danger' : ''}`}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.icon} {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
