import type { CSSProperties } from 'react';
import Biggu from '../components/Biggu';
import { Icon, ScoreStamp, Tape, type TapeColor } from '../components/Scrap';
import TopBar from '../components/TopBar';
import { signOut } from '../lib/auth';
import type { Route } from '../lib/router';
import type { Note } from '../lib/types';
import { t } from '../strings';

const TAPES: TapeColor[] = ['pink', 'mint', 'yellow', 'blue', 'lilac'];
const TILTS = [-2, 1.5, -1, 2, -1.5, 1];
/** Tilt goes through a CSS variable so the phone list can tone it down (a full-width card tilted 2° looks off). */
const tilt = (deg: number) => ({ '--tilt': `${deg}deg` }) as CSSProperties;

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
      {/* Phones get a one-column list of sideways polaroids (title gets the full width); wider screens a grid. */}
      <div className="polaroid-grid">
        <button className="polaroid polaroid-new" style={tilt(-1)} onClick={() => navigate({ name: 'new' })}>
          <span className="polaroid-tape">
            <Tape color="blue" pattern="stripes" width={80} />
          </span>
          <div className="polaroid-photo new">
            <Icon name="plus" size={40} />
          </div>
          <div className="polaroid-body">
            <div className="polaroid-caption hand">{t.newLesson}</div>
          </div>
        </button>

        {notes?.map((n, i) => {
          const score = noteScore(n);
          return (
            <button
              key={n.id}
              className="polaroid"
              style={tilt(TILTS[i % TILTS.length])}
              onClick={() => navigate({ name: 'note', noteId: n.id })}
            >
              <span className="polaroid-tape">
                <Tape color={TAPES[i % TAPES.length]} width={80} rotate={i % 2 ? 5 : -5} />
              </span>
              <div className={`polaroid-photo tint-${i % 5} ${score !== undefined ? 'has-score' : ''}`}>
                <span className="polaroid-initial hand" aria-hidden>
                  {[...n.subject.trim()][0]?.toUpperCase() ?? '?'}
                </span>
                {score !== undefined && (
                  <span className="polaroid-stamp">
                    <ScoreStamp score={score} size={48} />
                  </span>
                )}
              </div>
              <div className="polaroid-body">
                <div className="polaroid-caption hand">{n.title}</div>
                <div className="polaroid-meta">
                  <span className="subject-chip">{n.subject}</span>
                  <span className="parts-count">{t.parts(n.chunks.length)}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </main>
  );
}
