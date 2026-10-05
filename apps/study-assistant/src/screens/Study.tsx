import { useMemo } from 'react';
import Biggu, { type BigguMood } from '../components/Biggu';
import Markdown from '../components/Markdown';
import MarkedWords from '../components/MarkedWords';
import Menu from '../components/Menu';
import PartTitle from '../components/PartTitle';
import { Icon, Paper, Star } from '../components/Scrap';
import TopBar from '../components/TopBar';
import { notesStore } from '../lib/notes';
import { encodeMarks, textHash } from '../lib/marks';
import { HINT_LIMITS, useHintLimit } from '../lib/settings';
import type { Route } from '../lib/router';
import type { AppUser, Note } from '../lib/types';
import { HINT_VISIBLE_MS, useRecitation } from '../lib/useRecitation';
import { tokenize } from '../lib/words';
import { t } from '../strings';

export default function Study({
  user,
  note,
  index,
  navigate,
  onBack,
}: {
  user: AppUser;
  note: Note;
  index: number;
  navigate: (r: Route, opts?: { replace?: boolean }) => void;
  onBack: () => void;
}) {
  const chunk = note.chunks[index];
  const tokens = useMemo(() => tokenize(chunk.markdown), [chunk.markdown]);
  const vocabulary = useMemo(() => {
    // The note's hard terms plus this chunk's own longer words bias recognition toward what she'll say.
    const own = tokens.map((tk) => tk.display.replace(/[^\p{L}\p{N}'-]/gu, '')).filter((w) => w.length >= 6);
    return [...new Set([...note.glossary, ...own])].slice(0, 100);
  }, [note.glossary, tokens]);
  const [hintLimit, setHintLimit] = useHintLimit();
  const rec = useRecitation(tokens, vocabulary, hintLimit);
  const isLast = index === note.chunks.length - 1;

  async function finish() {
    const result = await rec.stop();
    await notesStore
      .recordAttempt(user.uid, note, index, {
        at: Date.now(),
        percent: result.percent,
        hints: result.hints,
        marks: encodeMarks(result.statuses),
        textHash: textHash(chunk.markdown),
      })
      .catch(() => {});
  }

  function goNext() {
    rec.reset();
    if (isLast) navigate({ name: 'note', noteId: note.id }, { replace: true });
    else navigate({ name: 'chunk', noteId: note.id, index: index + 1 }, { replace: true });
  }

  const header = (
    <TopBar
      onBack={() => {
        rec.reset();
        onBack();
      }}
      title={<PartTitle title={chunk.title} pill={t.part(index + 1, note.chunks.length)} />}
      right={
        rec.phase === 'idle' ? (
          <Menu
            items={[
              {
                label: t.progress,
                icon: <Icon name="chart" size={20} />,
                onSelect: () => navigate({ name: 'progress', noteId: note.id, index }),
              },
            ]}
          />
        ) : undefined
      }
    />
  );

  // ---- reading
  if (rec.phase === 'idle') {
    return (
      <main className="screen">
        {header}
        <Paper tilt={-0.6} tape="pink" className="read-card">
          <div className="read-head">
            <div className="read-label hand">
              <Icon name="book" size={22} /> {t.read}
            </div>
            <button className="text-btn" onClick={() => navigate({ name: 'edit', noteId: note.id, index })} aria-label={t.edit} title={t.edit}>
              <Icon name="pencil" size={20} />
            </button>
          </div>
          <Markdown text={chunk.markdown} />
        </Paper>
        <div className="hint-limit">
          <span className="hint-limit-label">
            <Icon name="bulb" size={20} /> {t.hintLimit}
          </span>
          <div className="seg small" role="radiogroup" aria-label={t.hintLimit}>
            {HINT_LIMITS.map((n) => (
              <button key={n} role="radio" aria-checked={hintLimit === n} className={hintLimit === n ? 'on' : ''} onClick={() => setHintLimit(n)}>
                {n === Infinity ? '∞' : n}
              </button>
            ))}
          </div>
        </div>
        {rec.error && <p className="error-text">{rec.error === 'mic' ? t.micDenied : t.error}</p>}
        <div className="bottom-action with-biggu">
          <Biggu mood="read" size={84} className="corner-biggu" />
          <button className="btn btn-primary btn-big btn-mic" onClick={rec.start}>
            <Icon name="mic" size={30} /> {t.startSpeaking}
          </button>
        </div>
      </main>
    );
  }

  // ---- talking
  if (rec.phase === 'connecting' || rec.phase === 'listening') {
    const lastHeard = rec.heard.split(/\s+/).slice(-10).join(' ');
    return (
      <main className="screen center listening">
        {header}
        <div className="listen-stage">
          <Biggu
            mood={rec.hint ? 'hint' : rec.phase === 'connecting' || rec.hintLoading ? 'think' : 'listen'}
            size={190}
            className={rec.hint ? '' : 'bob'}
          />
          {rec.hint ? (
            <div key={rec.hint.id} className="hint-bubble hand" role="status" aria-live="assertive">
              {rec.hint.text}
              <svg className="hint-timer" viewBox="0 0 24 24" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="9" style={{ animationDuration: `${HINT_VISIBLE_MS}ms` }} />
              </svg>
            </div>
          ) : (
            rec.hintLoading && (
              <div className="hint-bubble hint-loading" aria-label={t.thinking}>
                <span className="dots-loader">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            )
          )}
        </div>
        <p className="big-status hand">{rec.phase === 'connecting' ? t.connecting : t.listening}</p>
        {rec.phase === 'listening' && !rec.heard && <p className="muted tip">{t.stuckTip}</p>}
        <div className="progress-tape" aria-label={`${Math.round(rec.progress * 100)}%`}>
          <div className="progress-fill" style={{ width: `${Math.round(rec.progress * 100)}%` }} />
        </div>
        <p className="heard-line">{lastHeard || ' '}</p>
        <div className="bottom-action two">
          <button
            className="btn btn-hint"
            onClick={rec.askHint}
            disabled={rec.phase !== 'listening' || rec.hintLoading || rec.hintsLeft === 0}
          >
            <Icon name="bulb" size={26} /> {t.hintButton}
            {rec.hintsLeft !== Infinity && <span className="hints-left">{rec.hintsLeft}</span>}
          </button>
          <button className="btn btn-stop" onClick={finish} disabled={rec.phase !== 'listening'}>
            <Icon name="stop" size={26} /> {t.done}
          </button>
        </div>
      </main>
    );
  }

  // ---- scoring
  if (rec.phase === 'scoring' || !rec.result) {
    return (
      <main className="screen center">
        {header}
        <Biggu mood="think" size={190} className="bob" />
        <p className="big-status hand">{t.scoring}</p>
      </main>
    );
  }

  // ---- result
  const { percent, statuses, hints } = rec.result;
  const mood: BigguMood = percent >= 90 ? 'cheer' : percent >= 70 ? 'proud' : percent >= 40 ? 'wave' : 'sleepy';

  return (
    <main className="screen">
      {header}
      <div className="result-head">
        <Biggu mood={mood} size={130} />
        <Paper tilt={2} tape="yellow" className="score-card">
          <div className="score-number hand">{percent}%</div>
          <div className="score-label">{t.remembered}</div>
          <div className="score-cheer">{t.cheer(percent)}</div>
          <div className="score-hints">
            <Icon name="bulb" size={16} /> {t.hintsTaken(hints)}
          </div>
          {percent >= 90 && <Star size={28} style={{ position: 'absolute', right: -10, top: -10 }} />}
        </Paper>
      </div>

      <MarkedWords tokens={tokens} statuses={statuses} />

      <div className="bottom-action two">
        <button className="btn" onClick={() => rec.reset()}>
          <Icon name="retry" /> {t.retry}
        </button>
        <button className="btn btn-primary" onClick={goNext}>
          {isLast ? t.allDone : t.nextPart} <Icon name="next" />
        </button>
      </div>
    </main>
  );
}
