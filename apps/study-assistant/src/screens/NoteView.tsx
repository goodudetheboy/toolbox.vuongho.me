import { useState } from 'react';
import Biggu from '../components/Biggu';
import { Icon, ScoreStamp } from '../components/Scrap';
import TopBar from '../components/TopBar';
import { notesStore } from '../lib/notes';
import type { Route } from '../lib/router';
import type { AppUser, Note } from '../lib/types';
import { t } from '../strings';

/** The part to study next: the first one never tried, else the weakest. */
function nextUp(note: Note): number {
  const untried = note.chunks.findIndex((c) => c.bestScore === undefined);
  if (untried >= 0) return untried;
  return note.chunks.reduce((best, c, i) => ((c.bestScore ?? 0) < (note.chunks[best].bestScore ?? 0) ? i : best), 0);
}

export default function NoteView({
  user,
  note,
  fidelityWarning,
  navigate,
  onBack,
}: {
  user: AppUser;
  note: Note;
  fidelityWarning: boolean;
  navigate: (r: Route) => void;
  onBack: () => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const up = nextUp(note);
  const open = (index: number) => navigate({ name: 'chunk', noteId: note.id, index });

  return (
    <main className="screen">
      <TopBar onBack={onBack} title={<span className="hand title-ellipsis">{note.title}</span>} />

      <div className="note-head">
        <span className="subject-sticker">{note.subject}</span>
        <span className="muted">{t.parts(note.chunks.length)}</span>
      </div>

      {fidelityWarning && (
        <div className="warning-note">
          <Biggu mood="think" size={56} />
          <span>{t.fidelityWarning}</span>
        </div>
      )}

      <ol className="index-cards">
        {note.chunks.map((c, i) => (
          <li key={i} style={{ transform: `rotate(${i % 2 ? 0.6 : -0.6}deg)` }}>
            <button className={`index-card ${i === up ? 'up-next' : ''}`} onClick={() => open(i)}>
              <span className="index-num">{i + 1}</span>
              <span className="index-title">
                {c.title}
                {i === up && <span className="up-next-label">{t.nextUp}</span>}
              </span>
              {c.bestScore !== undefined ? <ScoreStamp score={c.bestScore} size={50} /> : <span className="index-go">›</span>}
            </button>
          </li>
        ))}
      </ol>

      <ProgressHistory note={note} />

      <div className="danger-zone">
        {!showMore ? (
          <button className="text-btn quiet" onClick={() => setShowMore(true)} aria-label={t.more}>
            <Icon name="dots" size={22} />
          </button>
        ) : (
          <>
            <button
              className="text-btn"
              onClick={async () => {
                const title = window.prompt(t.renamePrompt, note.title)?.trim();
                if (title && title !== note.title) await notesStore.updateNote(user.uid, note.id, { title });
              }}
            >
              <Icon name="pencil" size={18} /> {t.rename}
            </button>
            <button
              className="text-btn danger"
              onClick={async () => {
                if (!window.confirm(t.confirmDelete)) return;
                await notesStore.deleteNote(user.uid, note.id);
                onBack();
              }}
            >
              <Icon name="trash" size={18} /> {t.deleteLesson}
            </button>
          </>
        )}
      </div>

      <div className="bottom-action">
        <button className="btn btn-primary btn-big" onClick={() => open(up)}>
          {t.part(up + 1, note.chunks.length)} <Icon name="next" />
        </button>
      </div>
    </main>
  );
}

const SHOWN = 10;

/** Every recorded score for this note, newest first, with the change since that part's previous try. */
function ProgressHistory({ note }: { note: Note }) {
  const [all, setAll] = useState(false);
  const history = note.history ?? [];
  const rows = history
    .map((a, i) => {
      const prev = history.slice(0, i).reverse().find((p) => p.part === a.part);
      return { a, delta: prev ? a.percent - prev.percent : null };
    })
    .reverse();
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
          {shown.map(({ a, delta }) => (
            <li key={`${a.at}-${a.part}`} className="history-row">
              <ScoreStamp score={a.percent} size={44} />
              <span className="history-main">
                <span className="history-part">
                  {a.part + 1}. {note.chunks[a.part]?.title ?? ''}
                </span>
                <span className="history-meta">
                  {when(a.at)} · {t.hintsTaken(a.hints)}
                </span>
              </span>
              {delta !== null && delta !== 0 && (
                <span className={`history-delta ${delta > 0 ? 'up' : 'down'}`}>
                  {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
                </span>
              )}
            </li>
          ))}
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
