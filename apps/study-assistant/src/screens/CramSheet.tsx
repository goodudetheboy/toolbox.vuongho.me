import { useEffect, useMemo, useState } from 'react';
import Biggu from '../components/Biggu';
import { ConfirmDialog } from '../components/Dialog';
import Menu from '../components/Menu';
import PartTitle from '../components/PartTitle';
import { Icon, Paper, type TapeColor } from '../components/Scrap';
import TopBar from '../components/TopBar';
import { countForPages, rankIdeas, RECENT_TRIES, type CramIdea, type CramSort } from '../lib/cram';
import { daysUntil, examParts, examsStore } from '../lib/exams';
import { textHash } from '../lib/marks';
import { notesStore } from '../lib/notes';
import type { Route } from '../lib/router';
import { ensureTags } from '../lib/tags';
import { clearTicks, loadTicks, saveTicks } from '../lib/ticks';
import type { AppUser, Exam, Note } from '../lib/types';
import { tokenize, type Token } from '../lib/words';
import { t } from '../strings';

const TAPES: TapeColor[] = ['pink', 'mint', 'yellow', 'lilac'];
const TILTS = [-0.6, 0.6, -0.4, 0.5];
const SORT_KEY = 'study-assistant:cram-sort';

interface SheetIdea extends CramIdea {
  noteId: string;
  source: string;
  words: Token[];
}

function savedSort(): CramSort {
  try {
    return localStorage.getItem(SORT_KEY) === 'important' ? 'important' : 'relevant';
  } catch {
    return 'relevant';
  }
}

/** The idea's words, a paragraph per displayed line, with the note's bold key phrases highlighted. */
function Excerpt({ words }: { words: Token[] }) {
  // Lines of runs: consecutive bold words share one highlight, like **Krebs cycle** in the note.
  const lines: { bold: boolean; text: string }[][] = [];
  words.forEach((w, i) => {
    if (i === 0 || w.line !== words[i - 1].line) lines.push([]);
    const line = lines[lines.length - 1];
    const last = line[line.length - 1];
    if (last && last.bold === !!w.bold) last.text += ` ${w.display}`;
    else line.push({ bold: !!w.bold, text: (last ? ' ' : '') + w.display });
  });
  return (
    <div className="md cram-text">
      {lines.map((runs, i) => (
        <p key={i}>
          {runs.map((r, k) =>
            r.bold ? (
              <span key={k}>
                {r.text.startsWith(' ') ? ' ' : ''}
                <strong>{r.text.trimStart()}</strong>
              </span>
            ) : (
              <span key={k}>{r.text}</span>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

/**
 * Exam cram sheet: the exam's ideas, best first, ~5 minutes of reading at a time. Ranking is
 * deterministic (lib/cram.ts) and frozen while the sheet is open — "give meow more" only shows
 * the next slice of the same list. Built fresh each time it opens, so new tries and edits count.
 */
export default function CramSheet({
  user,
  exam,
  notes,
  navigate,
  onBack,
}: {
  user: AppUser;
  exam: Exam;
  notes: Note[];
  navigate: (r: Route) => void;
  onBack: () => void;
}) {
  const parts = useMemo(() => examParts(exam, notes), [exam, notes]);
  // Only a change to WHICH text is on the exam rebuilds the sheet (not a new score on a note).
  const signature = parts.map(({ note, part }) => `${note.id}/${part}@${textHash(note.chunks[part].markdown)}`).join('|');

  const [ideas, setIdeas] = useState<SheetIdea[] | null>(null);
  const [sort, setSort] = useState<CramSort>(savedSort);
  const [pages, setPages] = useState(1);
  const [ticks, setTicks] = useState(() => loadTicks(exam.id));
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIdeas(null);
    setPages(1);
    (async () => {
      const texts = parts.map(({ note, part }) => ({ noteId: note.id, part, markdown: note.chunks[part].markdown }));
      const [tags, attempts] = await Promise.all([
        ensureTags(user.uid, texts),
        Promise.all(
          // pageAttempts returns up to size + 1, newest first.
          texts.map((p) => notesStore.pageAttempts(user.uid, p.noteId, p.part, RECENT_TRIES - 1).catch(() => [])),
        ),
      ]);
      const out: SheetIdea[] = [];
      parts.forEach(({ note, part }, i) => {
        const markdown = note.chunks[part].markdown;
        const tokens = tokenize(markdown);
        const hash = textHash(markdown);
        const marks = attempts[i]
          .filter((a) => a.marks && a.textHash === hash && a.marks.length === tokens.length)
          .map((a) => a.marks!);
        const noteOrder = exam.notes.findIndex((p) => p.noteId === note.id);
        for (const idea of tags[i]) {
          if (idea.end >= tokens.length) continue;
          out.push({
            ...idea,
            key: `${note.id}/${part}/${idea.start}-${idea.end}@${hash}`,
            noteOrder,
            part,
            marks,
            noteId: note.id,
            source: t.cramSource(note.title, part + 1),
            words: tokens.slice(idea.start, idea.end + 1),
          });
        }
      });
      if (!cancelled) setIdeas(out);
    })().catch(() => !cancelled && setIdeas([]));
    return () => {
      cancelled = true;
    };
    // `parts` is derived from `signature`; rebuilding on every note snapshot would reshuffle the sheet.
  }, [signature, user.uid]);

  const ranked = useMemo(() => (ideas ? rankIdeas(ideas, sort) : []), [ideas, sort]);
  const shown = ranked.slice(0, countForPages(ranked, pages));
  const days = daysUntil(exam.date);

  function pickSort(next: CramSort) {
    setSort(next);
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {
      // just a preference
    }
  }

  function toggleTick(key: string) {
    const next = new Set(ticks);
    if (!next.delete(key)) next.add(key);
    setTicks(next);
    saveTicks(exam.id, next);
  }

  return (
    <main className="screen">
      <TopBar
        onBack={onBack}
        title={<PartTitle title={exam.title} pill={t.daysToGo(days)} />}
        right={
          <Menu
            items={[
              { label: t.editExam, icon: <Icon name="pencil" size={20} />, onSelect: () => navigate({ name: 'editExam', examId: exam.id }) },
              { label: t.deleteExam, icon: <Icon name="trash" size={20} />, onSelect: () => setConfirmDelete(true), danger: true },
            ]}
          />
        }
      />

      {!ideas ? (
        <div className="progress-state">
          <Biggu mood="think" size={130} className="bob" />
          <p className="muted">{t.pickingIdeas}</p>
        </div>
      ) : ideas.length === 0 ? (
        <div className="progress-state">
          <Biggu mood="think" size={130} />
          <p className="muted">{t.cramEmpty}</p>
        </div>
      ) : (
        <>
          <div className="cram-sort">
            <div className="seg small" role="radiogroup" aria-label={t.sortBy}>
              {(['relevant', 'important'] as const).map((k) => (
                <button key={k} role="radio" aria-checked={sort === k} className={sort === k ? 'on' : ''} onClick={() => pickSort(k)}>
                  {k === 'relevant' ? t.mostRelevant : t.mostImportant}
                </button>
              ))}
            </div>
          </div>

          <div className="cram-list">
            {shown.map((x, i) => {
              const done = ticks.has(x.key);
              return (
                <Paper key={x.key} tilt={TILTS[i % TILTS.length]} tape={TAPES[i % TAPES.length]} className={`cram-card ${done ? 'done' : ''}`}>
                  <div className="read-head">
                    <button className="read-label hand cram-source" onClick={() => navigate({ name: 'chunk', noteId: x.noteId, index: x.part })}>
                      <Icon name="book" size={22} /> <span>{x.source} ›</span>
                    </button>
                    <button
                      className={`tick ${done ? 'on' : ''}`}
                      aria-pressed={done}
                      aria-label={t.rememberThis}
                      title={t.rememberThis}
                      onClick={() => toggleTick(x.key)}
                    >
                      <Icon name="check" size={22} />
                    </button>
                  </div>
                  <Excerpt words={x.words} />
                </Paper>
              );
            })}
          </div>

          {shown.length < ranked.length ? (
            <div className="give-more">
              <Biggu mood="read" size={84} className="corner-biggu" />
              <button className="btn btn-primary btn-big" onClick={() => setPages((p) => p + 1)}>
                {t.giveMore}
              </button>
            </div>
          ) : (
            <div className="all-read">
              <Biggu mood="cheer" size={140} />
              <p className="big-status hand">{t.allRead}</p>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t.confirmDeleteExam}
        message={t.confirmDeleteExamBody(exam.title)}
        confirmLabel={t.delete}
        danger
        mood="sleepy"
        onConfirm={async () => {
          await examsStore.remove(user.uid, exam.id);
          clearTicks(exam.id);
          setConfirmDelete(false);
          onBack();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </main>
  );
}
