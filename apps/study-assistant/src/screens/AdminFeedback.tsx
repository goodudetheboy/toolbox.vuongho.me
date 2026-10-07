import { useEffect, useMemo, useState } from 'react';
import Biggu from '../components/Biggu';
import MarkedWords from '../components/MarkedWords';
import { BigguFace, ScoreStamp } from '../components/Scrap';
import { DOWN_REASONS, listAllFeedback, type FeedbackEntry, type FeedbackRecord } from '../lib/feedback';
import { decodeMarks } from '../lib/marks';
import type { AppUser } from '../lib/types';
import { tokenize } from '../lib/words';
import { t } from '../strings';

type Filter = keyof typeof t.admin.filters;

const matches = (r: FeedbackRecord, f: Filter) =>
  f === 'all' || (f === 'comment' ? r.comment.length > 0 : r.rating === f);

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Admin Feedback tab: every user's session feedback (users/{uid}/feedback/*), newest
 * first, with the full saved context of each session and a JSONL download for tuning.
 */
export default function AdminFeedback({ user }: { user: AppUser }) {
  const [entries, setEntries] = useState<FeedbackEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setEntries(null);
    listAllFeedback()
      .then((e) => !cancelled && setEntries(e))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const shown = useMemo(() => entries?.filter((e) => matches(e.record, filter)) ?? [], [entries, filter]);
  const reasonCounts = useMemo(
    () => DOWN_REASONS.map((r) => [r, entries?.filter((e) => e.record.reasons.includes(r)).length ?? 0] as const),
    [entries],
  );

  function download() {
    const jsonl = shown.map((e) => JSON.stringify({ uid: e.uid, ...e.record })).join('\n') + '\n';
    const url = URL.createObjectURL(new Blob([jsonl], { type: 'application/x-ndjson' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `study-feedback-${new Date().toISOString().slice(0, 10)}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {error ? (
        <div className="progress-state">
          <Biggu mood="think" size={110} />
          <p className="error-text">{t.error}</p>
          <button className="btn" onClick={() => setReload((n) => n + 1)}>
            {t.retry}
          </button>
        </div>
      ) : !entries ? (
        <div className="progress-state">
          <Biggu mood="think" size={110} className="bob" />
        </div>
      ) : (
        <>
          <div className="progress-stats">
            <div className="stat">
              <span className="stat-num hand">{entries.length}</span>
              <span className="stat-label">{t.admin.total}</span>
            </div>
            <div className="stat">
              <span className="stat-num hand good">{entries.filter((e) => e.record.rating === 'up').length}</span>
              <span className="stat-label">{t.admin.good}</span>
            </div>
            <div className="stat">
              <span className="stat-num hand off">{entries.filter((e) => e.record.rating === 'down').length}</span>
              <span className="stat-label">{t.admin.off}</span>
            </div>
          </div>

          {reasonCounts.some(([, n]) => n > 0) && (
            <ul className="admin-reasons">
              {reasonCounts.map(([r, n]) => (
                <li key={r}>
                  <span>{t.feedbackReason[r]}</span>
                  <b>{n}</b>
                </li>
              ))}
            </ul>
          )}

          <div className="admin-toolbar">
            <div className="chips">
              {(Object.keys(t.admin.filters) as Filter[]).map((f) => (
                <button key={f} className={`chip ${filter === f ? 'on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {t.admin.filters[f]}
                </button>
              ))}
            </div>
            <button className="text-btn" onClick={download} disabled={shown.length === 0}>
              {t.admin.download}
            </button>
          </div>

          {shown.length === 0 ? (
            <p className="muted history-empty">{t.admin.empty}</p>
          ) : (
            <ol className="history-list">
              {shown.map((e) => {
                const r = e.record;
                const key = `${e.uid}/${r.attemptId}`;
                const isOpen = open === key;
                return (
                  <li key={key} className={`history-row ${isOpen ? 'open' : ''}`}>
                    <button className="history-btn" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)}>
                      <span className={`admin-face ${r.rating}`}>
                        <BigguFace mood={r.rating === 'up' ? 'happy' : 'sad'} size={30} />
                      </span>
                      <span className="history-main">
                        <span className="history-when">
                          {r.noteTitle} · {r.partTitle}
                        </span>
                        <span className="history-meta">
                          {when(r.createdAt)} · {e.uid === user.uid ? t.admin.you : t.admin.who(r.email, e.uid)}
                        </span>
                        {r.reasons.length > 0 && (
                          <span className="admin-tags">
                            {r.reasons.map((x) => (
                              <span key={x} className="admin-tag">
                                {t.feedbackReason[x]}
                              </span>
                            ))}
                          </span>
                        )}
                        {r.comment && <span className="admin-comment">“{r.comment}”</span>}
                      </span>
                      <ScoreStamp score={r.percent} size={40} />
                      <span className="history-chevron">›</span>
                    </button>
                    {isOpen && <Detail record={r} />}
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </>
  );
}

function Detail({ record: r }: { record: FeedbackRecord }) {
  const tokens = useMemo(() => tokenize(r.markdown), [r.markdown]);
  const linedUp = r.marks.length === tokens.length;
  const span = (start: number, end: number) => r.words.slice(start, end + 1).join(' ');

  return (
    <div className="history-detail admin-detail">
      <h4>{t.admin.words}</h4>
      {linedUp ? <MarkedWords tokens={tokens} statuses={decodeMarks(r.marks)} tilt={0} /> : <p className="muted">{r.words.join(' ')}</p>}

      <h4>{t.admin.transcript}</h4>
      <p className="admin-quote">{r.transcript.trim() || t.admin.noTranscript}</p>

      {r.hintLog.length > 0 && (
        <>
          <h4>
            {t.admin.hints} ({r.hintLog.length})
          </h4>
          <ul className="admin-list">
            {r.hintLog.map((h, i) => (
              <li key={i}>
                <b>{h.text}</b> <span className="muted">· {t.admin.hintAt(h.atMs / 1000, h.manual)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {r.ideas.length > 0 && (
        <>
          <h4>{t.admin.ideas}</h4>
          <ul className="admin-list">
            {r.ideas.map((idea, i) => (
              <li key={i}>
                <b className={idea.score >= 80 ? 'good' : idea.score >= 50 ? 'mid' : 'off'}>{idea.score}%</b>{' '}
                {span(idea.start, idea.end)}
                {idea.missed.length > 0 && (
                  <span className="muted"> · missed: {idea.missed.map((w) => r.words[w]).join(', ')}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <h4>{t.admin.meta}</h4>
      <dl className="admin-meta">
        <dt>{t.admin.gradedBy}</dt>
        <dd>{r.gradedBy}</dd>
        <dt>{t.admin.models}</dt>
        <dd>
          {r.models.transcribe ?? '–'} / {r.models.grade ?? '–'}
        </dd>
        <dt>{t.admin.duration}</dt>
        <dd>{Math.round(r.durationMs / 1000)} s</dd>
        <dt>{t.admin.hintLimit}</dt>
        <dd>{r.hintLimit ?? t.admin.noLimit}</dd>
        <dt>Note</dt>
        <dd>
          {r.subject} · part {r.part + 1}
        </dd>
      </dl>
    </div>
  );
}
