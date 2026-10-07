import { useEffect, type CSSProperties } from 'react';
import GuideCards from '../components/GuideCards';
import AccountMenu from '../components/AccountMenu';
import { PettableHead } from '../components/Pettable';
import { Icon, ScoreStamp, Tape, type TapeColor } from '../components/Scrap';
import TopBar from '../components/TopBar';
import { forgetCramSheets } from '../lib/cramCache';
import { daysUntil, examNoteCount, sortExams } from '../lib/exams';
import type { Route } from '../lib/router';
import type { Exam, Note } from '../lib/types';
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

export type HomeTab = 'notes' | 'exams';

const TAB_KEY = 'study-assistant:home-tab';

/** The tab she used last, so reopening the app lands where she left off. */
export function savedHomeTab(): HomeTab {
  try {
    return localStorage.getItem(TAB_KEY) === 'exams' ? 'exams' : 'notes';
  } catch {
    return 'notes';
  }
}

export default function Home({
  notes,
  exams,
  tab,
  userName,
  admin,
  navigate,
  onGuideSeen,
}: {
  userName: string;
  notes: Note[] | null;
  exams: Exam[] | null;
  tab: HomeTab;
  admin: boolean;
  navigate: (r: Route, options?: { replace?: boolean }) => void;
  onGuideSeen: () => void;
}) {
  // Opening an exam from here builds its cram sheet fresh (new tries count).
  useEffect(() => forgetCramSheets(), []);

  const pickTab = (next: HomeTab) => {
    if (next === tab) return;
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // just a preference
    }
    navigate({ name: next === 'exams' ? 'exams' : 'home' }, { replace: true });
  };
  const topBar = (
    <TopBar
      align="left"
      title={
        <span className="brand">
          <PettableHead size={52} className="biggu" /> <span className="hand">{t.appName}</span>
        </span>
      }
      right={<AccountMenu name={userName} admin={admin} navigate={navigate} />}
    />
  );

  // No notes yet: the "How it works" cards, ending on the first-note button.
  if (notes && notes.length === 0) {
    return (
      <main className="screen">
        {topBar}
        <GuideCards
          finishLabel={t.firstLesson}
          onFinish={() => {
            onGuideSeen();
            navigate({ name: 'new' });
          }}
        />
      </main>
    );
  }

  const tabs = (
    <div className="seg home-tabs" role="tablist">
      {(['notes', 'exams'] as const).map((k) => (
        <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => pickTab(k)}>
          {k === 'notes' ? t.tabNotes : t.tabExams}
        </button>
      ))}
    </div>
  );

  if (tab === 'exams') {
    const list = exams ? sortExams(exams) : null;
    return (
      <main className="screen">
        {topBar}
        {tabs}
        <div className="polaroid-grid">
          <button className="polaroid polaroid-new" style={tilt(-1)} onClick={() => navigate({ name: 'newExam' })}>
            <span className="polaroid-tape">
              <Tape color="blue" pattern="stripes" width={80} />
            </span>
            <div className="polaroid-photo new">
              <Icon name="plus" size={40} />
            </div>
            <div className="polaroid-body">
              <div className="polaroid-caption hand">{t.newExam}</div>
            </div>
          </button>

          {list?.map((x, i) => {
            const days = daysUntil(x.date);
            const [y, m, d] = x.date.split('-').map(Number);
            const month = new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
            return (
              <button
                key={x.id}
                className={`polaroid ${days < 0 ? 'past' : ''}`}
                style={tilt(TILTS[(i + 1) % TILTS.length])}
                onClick={() => navigate({ name: 'exam', examId: x.id })}
              >
                <span className="polaroid-tape">
                  <Tape color={TAPES[i % TAPES.length]} width={80} rotate={i % 2 ? 5 : -5} />
                </span>
                <div className={`polaroid-photo exam-photo tint-${i % 5}`} aria-hidden>
                  <span className="exam-month">{month}</span>
                  <span className="exam-day hand">{d}</span>
                </div>
                <div className="polaroid-body">
                  <div className="polaroid-caption hand">{x.title}</div>
                  <div className="polaroid-meta">
                    <span className={`days-chip ${days >= 0 && days <= 7 ? 'soon' : ''}`}>{t.daysTo(days)}</span>
                    <span className="parts-count">{t.notesCount(examNoteCount(x, notes ?? []))}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {list && list.length === 0 && <p className="muted exams-empty">{t.noExamsYet}</p>}
      </main>
    );
  }

  return (
    <main className="screen">
      {topBar}
      {tabs}
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
