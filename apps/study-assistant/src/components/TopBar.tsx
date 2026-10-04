import type { ReactNode } from 'react';
import { t } from '../strings';
import { Icon } from './Scrap';

export default function TopBar({
  onBack,
  title,
  right,
  align = 'center',
}: {
  onBack?: () => void;
  title?: ReactNode;
  right?: ReactNode;
  align?: 'center' | 'left';
}) {
  return (
    <header className="topbar">
      {align === 'left' && !onBack ? null : onBack ? (
        <button className="icon-btn" onClick={onBack} aria-label={t.back}>
          <Icon name="back" />
        </button>
      ) : (
        <span className="icon-btn-spacer" />
      )}
      <div className={`topbar-title ${align === 'left' ? 'left' : ''}`}>{title}</div>
      {right ?? <span className="icon-btn-spacer" />}
    </header>
  );
}
