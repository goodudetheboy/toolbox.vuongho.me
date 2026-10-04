import Biggu from '../components/Biggu';
import { Icon, ScoreStamp, Tape, type TapeColor } from '../components/Scrap';
import TopBar from '../components/TopBar';
import { signOut } from '../lib/auth';
import type { Route } from '../lib/router';
import type { Note } from '../lib/types';
import { t } from '../strings';

const TAPES: TapeColor[] = ['pink', 'mint', 'yellow', 'blue', 'lilac'];
const TILTS = [-2, 1.5, -1, 2, -1.5, 1];

export function noteScore(note: Note): number | undefined {
  const scores = note.chunks.map((c) => c.bestScore);
  if (scores.every((s) => s === undefined)) return undefined;
  return Math.round(scores.reduce<number>((a, s) => a + (s ?? 0), 0) / scores.length);
}

export default function Home({ notes, navigate }: { notes: Note[] | null; navigate: (r: Route) => void }) {
  const topBar = (
    <TopBar
      align="left"
      title={
        <span className="brand">
          <Biggu mood="wave" size={44} /> <span className="hand">{t.appName}</span>
        </span>
      }
      right={
        <button className="text-btn quiet" onClick={() => signOut()}>
          {t.signOut}
        </button>
      }
    />
  );

  // First visit: nothing to choose between — one cat, one button.
  if (notes && notes.length === 0) {
    return (
      <main className="screen">
        {topBar}
        <div className="first-run">
          <Biggu mood="read" size={190} className="bob" />
          <button className="btn btn-primary btn-big" onClick={() => navigate({ name: 'new' })}>
            <Icon name="plus" /> {t.firstLesson}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="screen">
      {topBar}
      <h2 className="section-title hand">{t.lessons}</h2>
      <div className="polaroid-grid">
        <button className="polaroid polaroid-new" style={{ transform: 'rotate(-1deg)' }} onClick={() => navigate({ name: 'new' })}>
          <Tape color="blue" pattern="stripes" width={80} style={{ position: 'absolute', top: -12, left: '50%', marginLeft: -40 }} />
          <div className="polaroid-photo new">
            <Icon name="plus" size={48} />
          </div>
          <div className="polaroid-caption hand">{t.newLesson}</div>
        </button>

        {notes?.map((n, i) => (
          <button
            key={n.id}
            className="polaroid"
            style={{ transform: `rotate(${TILTS[i % TILTS.length]}deg)` }}
            onClick={() => navigate({ name: 'note', noteId: n.id })}
          >
            <Tape color={TAPES[i % TAPES.length]} width={80} rotate={i % 2 ? 5 : -5} style={{ position: 'absolute', top: -12, left: '50%', marginLeft: -40 }} />
            <div className={`polaroid-photo tint-${i % 5}`}>
              <span className="subject-chip">{n.subject}</span>
              <span className="parts-count">{t.parts(n.chunks.length)}</span>
              <span className="polaroid-stamp">
                <ScoreStamp score={noteScore(n)} size={48} />
              </span>
            </div>
            <div className="polaroid-caption hand">{n.title}</div>
          </button>
        ))}
      </div>
    </main>
  );
}
