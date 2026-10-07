import { useEffect, useMemo, useState } from 'react';
import Biggu from '../components/Biggu';
import MarkedWords from '../components/MarkedWords';
import PartTitle from '../components/PartTitle';
import { ScoreStamp } from '../components/Scrap';
import TopBar from '../components/TopBar';
import { decodeMarks, textHash } from '../lib/marks';
import { notesStore, partId } from '../lib/notes';
import type { AppUser, Attempt, Note } from '../lib/types';
import { tokenize } from '../lib/words';
import { t } from '../strings';

const PAGE = 10;

/** One loaded page: its attempts (newest first) plus the next-older one, for the last row's ▲/▼. */
interface Page {
  items: Attempt[];
  older: Attempt | null;
}

/**
 * A part's recitation history, a page at a time — only the page on screen is ever
 * downloaded (pages already seen are kept, so going back costs nothing).
 * Tapping a try shows its colored words.
 */
export default function Progress({ user, note, index, onBack }: { user: AppUser; note: Note; index: number; onBack: () => void }) {
  const chunk = note.chunks[index];
  const tokens = useMemo(() => tokenize(chunk.markdown), [chunk.markdown]);
  const hash = useMemo(() => textHash(chunk.markdown), [chunk.markdown]);
  const [pages, setPages] = useState<Page[]>([]);
  const [page, setPage] = useState(0);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (pages[page]) return;
    if (page > 0 && !pages[page - 1]) return;
    let cancelled = false;
    setError(false);
    const before = page === 0 ? undefined : pages[page - 1].items.at(-1)?.at;
    notesStore
      .pageAttempts(user.uid, note.id, partId(note, index), PAGE, before)
      .then((res) => {
        if (cancelled) return;
        setPages((p) => {
          const next = [...p];
          next[page] = { items: res.slice(0, PAGE), older: res[PAGE] ?? null };
          return next;
        });
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [page, pages, user.uid, note.id, index]);

  const current = pages[page];
  const tries = chunk.tries ?? 0;
  const totalPages = Math.max(1, Math.ceil(tries / PAGE));
  const when = (at: number) =>
    new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const go = (p: number) => {
    setOpen(null);
    setPage(p);
    window.scrollTo({ top: 0 });
  };

  return (
    <main className="screen">
      <TopBar
        onBack={onBack}
        title={<PartTitle title={chunk.title} pill={t.progress} />}
      />

      <div className="progress-stats">
        <div className="stat">
          <ScoreStamp score={chunk.bestScore} size={58} />
          {chunk.bestScore === undefined && <span className="stat-empty">–</span>}
          <span className="stat-label">{t.best}</span>
        </div>
        <div className="stat">
          <ScoreStamp score={chunk.lastScore} size={58} />
          {chunk.lastScore === undefined && <span className="stat-empty">–</span>}
          <span className="stat-label">{t.last}</span>
        </div>
        <div className="stat">
          <span className="stat-num hand">{tries}</span>
          <span className="stat-label">{t.triesLabel}</span>
        </div>
      </div>

      {error ? (
        <div className="progress-state">
          <Biggu mood="think" size={110} />
          <p className="error-text">{t.error}</p>
          <button className="btn" onClick={() => setPages((p) => p.slice(0, page))}>
            {t.retry}
          </button>
        </div>
      ) : !current ? (
        <div className="progress-state">
          <Biggu mood="think" size={110} className="bob" />
        </div>
      ) : current.items.length === 0 ? (
        <p className="muted history-empty">{t.noHistory}</p>
      ) : (
        <ol className="history-list">
          {current.items.map((a, i) => {
            const prev = current.items[i + 1] ?? current.older;
            const delta = prev ? a.percent - prev.percent : null;
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

      {(page > 0 || current?.older) && (
        <nav className="pager" aria-label={t.progress}>
          <button className="btn" onClick={() => go(page - 1)} disabled={page === 0}>
            ‹ {t.newer}
          </button>
          <span className="pager-pos">{t.pageOf(page + 1, Math.max(totalPages, page + 1))}</span>
          <button className="btn" onClick={() => go(page + 1)} disabled={!current?.older}>
            {t.older} ›
          </button>
        </nav>
      )}
    </main>
  );
}
