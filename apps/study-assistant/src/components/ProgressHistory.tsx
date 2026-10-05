import { useState } from 'react';
import { decodeMarks, textHash } from '../lib/marks';
import type { Attempt } from '../lib/types';
import type { Token } from '../lib/words';
import { t } from '../strings';
import MarkedWords from './MarkedWords';
import { ScoreStamp } from './Scrap';

const SHOWN = 10;

/**
 * One part's recorded scores, newest first, with the change since the previous try.
 * Tapping a row opens that try's colored words (attempts from before marks were saved can't open).
 */
export default function ProgressHistory({ history, markdown, tokens }: { history: Attempt[]; markdown: string; tokens: Token[] }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const hash = textHash(markdown);
  const rows = history.map((a, i) => ({ a, delta: i > 0 ? a.percent - history[i - 1].percent : null })).reverse();
  const shown = all ? rows : rows.slice(0, SHOWN);
  const when = (at: number) =>
    new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <section className="history">
      <h2 className="hand history-title">{t.progress}</h2>
      {rows.length === 0 ? (
        <p className="muted history-empty">{t.noHistory}</p>
      ) : (
        <ol className="history-list">
          {shown.map(({ a, delta }) => {
            const isOpen = open === a.at;
            const linedUp = a.marks !== undefined && a.textHash === hash && a.marks.length === tokens.length;
            return (
              <li key={a.at} className={`history-row ${isOpen ? 'open' : ''}`}>
                <button
                  className="history-btn"
                  disabled={!a.marks}
                  aria-expanded={a.marks ? isOpen : undefined}
                  onClick={() => setOpen(isOpen ? null : a.at)}
                >
                  <ScoreStamp score={a.percent} size={44} />
                  <span className="history-main">
                    <span className="history-when">{when(a.at)}</span>
                    <span className="history-meta">{t.hintsTaken(a.hints)}</span>
                  </span>
                  {delta !== null && delta !== 0 && (
                    <span className={`history-delta ${delta > 0 ? 'up' : 'down'}`}>
                      {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
                    </span>
                  )}
                  {a.marks && <span className="history-chevron">›</span>}
                </button>
                {isOpen && (
                  <div className="history-detail">
                    {linedUp ? (
                      <MarkedWords tokens={tokens} statuses={decodeMarks(a.marks!)} tilt={0} />
                    ) : (
                      <p className="muted history-empty">{t.editedSince}</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {!all && rows.length > SHOWN && (
        <button className="text-btn history-more" onClick={() => setAll(true)}>
          {t.showAll(rows.length)}
        </button>
      )}
    </section>
  );
}
