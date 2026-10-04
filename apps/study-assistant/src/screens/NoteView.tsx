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

      <div className="danger-zone">
        {!showMore ? (
          <button className="text-btn quiet" onClick={() => setShowMore(true)} aria-label={t.more}>
            <Icon name="dots" size={22} />
          </button>
        ) : (
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
