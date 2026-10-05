import { useMemo } from 'react';
import Biggu, { type BigguMood } from '../components/Biggu';
import Markdown from '../components/Markdown';
import { Icon, Paper, Star } from '../components/Scrap';
import TopBar from '../components/TopBar';
import { notesStore } from '../lib/notes';
import type { Route } from '../lib/router';
import type { AppUser, Note } from '../lib/types';
import { useRecitation, type WordStatus } from '../lib/useRecitation';
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
  const rec = useRecitation(tokens, vocabulary);
  const isLast = index === note.chunks.length - 1;

  async function finish() {
    const percent = await rec.stop();
    if (percent === null) return;
    await notesStore
      .updateChunk(user.uid, note, index, {
        lastScore: percent,
        bestScore: Math.max(percent, chunk.bestScore ?? 0),
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
      title={
        <span className="study-title">
          <span className="hand title-ellipsis">{chunk.title}</span>
          <span className="part-pill">{t.part(index + 1, note.chunks.length)}</span>
        </span>
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
            <button className="text-btn" onClick={() => navigate({ name: 'edit', noteId: note.id, index })}>
              <Icon name="pencil" size={18} /> {t.edit}
            </button>
          </div>
          <Markdown text={chunk.markdown} />
        </Paper>
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
            <div key={rec.hint.text} className="hint-bubble hand" role="status" aria-live="assertive">
              {rec.hint.text}
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
          <button className="btn btn-hint" onClick={rec.askHint} disabled={rec.phase !== 'listening' || rec.hintLoading}>
            <Icon name="bulb" size={26} /> {t.hintButton}
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
  const { percent, statuses } = rec.result;
  const mood: BigguMood = percent >= 90 ? 'cheer' : percent >= 70 ? 'proud' : percent >= 40 ? 'wave' : 'sleepy';
  const lines: { word: string; status: WordStatus }[][] = [];
  tokens.forEach((tk, i) => {
    (lines[tk.line] ??= []).push({ word: tk.display, status: statuses[i] });
  });

  return (
    <main className="screen">
      {header}
      <div className="result-head">
        <Biggu mood={mood} size={130} />
        <Paper tilt={2} tape="yellow" className="score-card">
          <div className="score-number hand">{percent}%</div>
          <div className="score-label">{t.remembered}</div>
          <div className="score-cheer">{t.cheer(percent)}</div>
          {percent >= 90 && <Star size={28} style={{ position: 'absolute', right: -10, top: -10 }} />}
        </Paper>
      </div>

      {/* Said words stay plain; only the colors that actually appear get a label. */}
      <div className="legend">
        {(['close', 'hinted', 'missed'] as const)
          .filter((k) => statuses.includes(k))
          .map((k) => (
            <span key={k} className={`lg ${k}`}>
              {t[k]}
            </span>
          ))}
      </div>

      <Paper tilt={-0.4} lined className="result-card">
        {lines.map((line, li) => (
          <p key={li} className="result-line">
            {line.map((w, wi) => (
              <span key={wi} className={`w w-${w.status}`}>
                {w.word}{' '}
              </span>
            ))}
          </p>
        ))}
      </Paper>

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
