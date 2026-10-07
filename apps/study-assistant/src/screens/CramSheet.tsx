import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import vporkFace from '../assets/vpork.webp';
import Biggu from '../components/Biggu';
import { ConfirmDialog, Modal } from '../components/Dialog';
import Menu from '../components/Menu';
import PartTitle from '../components/PartTitle';
import { PettableBiggu, PettableHead } from '../components/Pettable';
import { Icon, Paper, Tape, type TapeColor } from '../components/Scrap';
import TopBar from '../components/TopBar';
import { cachedSheet, forgetCramSheets, saveSheet } from '../lib/cramCache';
import { cheerSlots, VPORK_CHANCE, VPORK_EMAIL } from '../lib/cheer';
import { countForPages, rankIdeas, RECENT_TRIES, type CramIdea, type CramSort } from '../lib/cram';
import { daysUntil, examParts, examsStore } from '../lib/exams';
import { textHash } from '../lib/marks';
import { MOCK } from '../lib/mock';
import { notesStore, partId } from '../lib/notes';
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

/** The note filter gets a search box once the list is longer than this. */
const SEARCH_FROM = 5;

/** Which of the exam's notes the sheet shows; at least one always stays ticked. */
function NoteFilterDialog({
  open,
  notes,
  hidden,
  onApply,
  onCancel,
}: {
  open: boolean;
  notes: Note[];
  hidden: Set<string>;
  onApply: (hidden: Set<string>) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(hidden);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!open) return;
    setDraft(hidden);
    setQuery('');
  }, [open, hidden]);
  const q = query.trim().toLowerCase();
  const listed = q ? notes.filter((n) => `${n.title} ${n.subject}`.toLowerCase().includes(q)) : notes;
  const shownCount = notes.filter((n) => !draft.has(n.id)).length;
  const toggle = (id: string) => {
    const next = new Set(draft);
    if (!next.delete(id)) next.add(id);
    setDraft(next);
  };
  return (
    <Modal open={open} mood="read" title={t.filterNotes} onCancel={onCancel} onSubmit={() => onApply(draft)}>
      {/* Searching only narrows the list: the ticks of notes it hides stay as they are. */}
      {notes.length > SEARCH_FROM && (
        <label className="search-field filter-search">
          <Icon name="search" size={22} />
          <input
            className="text-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
            placeholder={t.searchNotes}
            aria-label={t.searchNotes}
          />
        </label>
      )}
      {listed.length === 0 && <p className="modal-message">{t.noNotesMatch(query.trim())}</p>}
      <ul className={`exam-picks ${notes.length > SEARCH_FROM ? 'with-search' : ''}`}>
        {listed.map((n) => {
          const on = !draft.has(n.id);
          return (
            <li key={n.id}>
              <button type="button" aria-pressed={on} disabled={on && shownCount === 1} onClick={() => toggle(n.id)}>
                <span className={`pick-circle small ${on ? 'on' : ''}`}>{on && <Icon name="check" size={20} />}</span>
                <span className="exam-pick-title hand">{n.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="modal-actions filter-actions">
        <button type="button" className="text-btn" onClick={() => setDraft(new Set())} disabled={draft.size === 0}>
          {t.allNotes}
        </button>
        <button type="submit" className="btn btn-primary">
          {t.done}
        </button>
      </div>
    </Modal>
  );
}

/** A small taped note between cards: Biggu cheering her on, or (rarely, on one account) Vpork. */
function CheerNote({ text, vpork }: { text: string; vpork: boolean }) {
  return (
    <div className={`cheer-note ${vpork ? 'vpork' : ''}`} role="note">
      <span className="cheer-tape">
        <Tape color={vpork ? 'pink' : 'mint'} width={70} rotate={vpork ? 6 : -6} />
      </span>
      {vpork ? <img src={vporkFace} width={64} height={64} alt="" /> : <PettableHead size={52} />}
      <span className="hand">{text}</span>
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
  const signature = parts.map(({ note, part }) => `${note.id}/${partId(note, part)}@${textHash(note.chunks[part].markdown)}`).join('|');

  // Back from a part (book button): pick up exactly where she was, without rebuilding.
  const [restored] = useState(() => cachedSheet<SheetIdea>(exam.id, signature));
  const [ideas, setIdeas] = useState<SheetIdea[] | null>(restored?.ideas ?? null);
  const [sort, setSort] = useState<CramSort>(savedSort);
  const [pages, setPages] = useState(restored?.pages ?? 1);
  // Notes hidden by the filter (empty = every note on the exam).
  const [hidden, setHidden] = useState<Set<string>>(() => restored?.hidden ?? new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [ticks, setTicks] = useState(() => loadTicks(exam.id));
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Picked once per visit, so the notes stay put through "give meow more" and re-sorting.
  const [cheerSeed] = useState(() => restored?.cheerSeed ?? Math.floor(Math.random() * 2 ** 31));
  const scrollY = useRef(restored?.scrollY ?? 0);
  // The text the sheet on screen was built from — set when a build finishes (or restored).
  const built = useRef(restored?.signature ?? null);

  useEffect(() => {
    if (built.current === signature) return; // already built from this text (e.g. restored)
    let cancelled = false;
    setIdeas(null);
    setPages(1);
    (async () => {
      const texts = parts.map(({ note, part }) => ({
        noteId: note.id,
        partId: partId(note, part),
        markdown: note.chunks[part].markdown,
      }));
      const [tags, attempts] = await Promise.all([
        ensureTags(user.uid, texts),
        Promise.all(
          // pageAttempts returns up to size + 1, newest first.
          texts.map((p) => notesStore.pageAttempts(user.uid, p.noteId, p.partId, RECENT_TRIES - 1).catch(() => [])),
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
            key: `${note.id}/${texts[i].partId}/${idea.start}-${idea.end}@${hash}`,
            noteOrder,
            part,
            marks,
            noteId: note.id,
            source: t.cramSource(note.title, part + 1),
            words: tokens.slice(idea.start, idea.end + 1),
          });
        }
      });
      if (cancelled) return;
      built.current = signature;
      setIdeas(out);
    })().catch(() => !cancelled && setIdeas([]));
    return () => {
      cancelled = true;
    };
    // `parts` is derived from `signature`; rebuilding on every note snapshot would reshuffle the sheet.
  }, [signature, user.uid]);

  // Remember the sheet as it is now, for coming back from a part.
  useEffect(() => {
    if (ideas) saveSheet(exam.id, { signature, ideas, pages, hidden, cheerSeed, scrollY: scrollY.current });
  }, [exam.id, signature, ideas, pages, hidden, cheerSeed]);
  useEffect(() => {
    const onScroll = () => {
      scrollY.current = window.scrollY;
      const s = cachedSheet<SheetIdea>(exam.id, signature);
      if (s) s.scrollY = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [exam.id, signature]);
  // Back at the same spot (before paint, so it doesn't flash at the top first).
  useLayoutEffect(() => {
    if (restored) window.scrollTo(0, restored.scrollY);
  }, [restored]);

  const ranked = useMemo(
    () => (ideas ? rankIdeas(hidden.size ? ideas.filter((x) => !hidden.has(x.noteId)) : ideas, sort) : []),
    [ideas, sort, hidden],
  );
  // The exam's notes that have something on the sheet, in exam order — the filter's chips.
  const sheetNotes = useMemo(() => {
    const ids = new Set(ideas?.map((x) => x.noteId));
    return exam.notes.flatMap((p) => {
      const note = notes.find((n) => n.id === p.noteId);
      return note && ids.has(note.id) ? [note] : [];
    });
  }, [ideas, exam.notes, notes]);
  // If the exam was edited so that every note left is hidden, show them all again.
  useEffect(() => {
    if (hidden.size && sheetNotes.every((n) => hidden.has(n.id))) setHidden(new Set());
  }, [hidden, sheetNotes]);

  function applyFilter(next: Set<string>) {
    setHidden(next);
    setPages(1); // a different set of notes: start again at the first 5 minutes
  }
  const shown = ranked.slice(0, countForPages(ranked, pages));
  // Dev only: the mock build can force Vpork with #vpork in the URL.
  const vporkChance = MOCK && window.location.hash === '#vpork' ? 1 : VPORK_CHANCE;
  const cheers = useMemo(
    () => new Map(cheerSlots(cheerSeed, ranked.length, MOCK || user.email === VPORK_EMAIL, vporkChance).map((c) => [c.after, c])),
    [cheerSeed, ranked.length, user.email, vporkChance],
  );
  const days = daysUntil(exam.date);

  function pickSort(next: CramSort) {
    setSort(next);
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {
      // just a preference
    }
  }

  function resetTicks() {
    setTicks(new Set());
    clearTicks(exam.id);
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
              {
                label: t.editExam,
                icon: <Icon name="pencil" size={20} />,
                onSelect: () => navigate({ name: 'editExam', examId: exam.id }),
              },
              // Only when something on this sheet is checked.
              ...(ideas?.some((x) => ticks.has(x.key))
                ? [{ label: t.uncheckAll, icon: <Icon name="retry" size={20} />, onSelect: resetTicks }]
                : []),
              {
                label: t.deleteExam,
                icon: <Icon name="trash" size={20} />,
                onSelect: () => setConfirmDelete(true),
                danger: true,
              },
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
                <button
                  key={k}
                  role="radio"
                  aria-checked={sort === k}
                  className={sort === k ? 'on' : ''}
                  onClick={() => pickSort(k)}
                >
                  {k === 'relevant' ? t.mostRelevant : t.mostImportant}
                </button>
              ))}
            </div>
            {sheetNotes.length > 1 && (
              <button
                className={`icon-btn cram-filter-btn ${hidden.size ? 'active' : ''}`}
                onClick={() => setFilterOpen(true)}
                aria-label={hidden.size ? t.filterOn : t.filterNotes}
                title={t.filterNotes}
              >
                <Icon name="filter" size={22} />
              </button>
            )}
          </div>

          <div className="cram-list">
            {shown.map((x, i) => {
              const done = ticks.has(x.key);
              const cheer = i < shown.length - 1 ? cheers.get(i) : undefined;
              return (
                <Fragment key={x.key}>
                  <Paper
                    tilt={TILTS[i % TILTS.length]}
                    tape={TAPES[i % TAPES.length]}
                    className={`cram-card ${done ? 'done' : ''}`}
                  >
                    <div className="cram-body">
                      <Excerpt words={x.words} />
                      <div className="cram-actions">
                        <button
                          className={`tick ${done ? 'on' : ''}`}
                          aria-pressed={done}
                          aria-label={t.rememberThis}
                          title={t.rememberThis}
                          onClick={() => toggleTick(x.key)}
                        >
                          <Icon name="check" size={22} />
                        </button>
                        <button
                          className="cram-open"
                          aria-label={t.openPart(x.source)}
                          title={x.source}
                          onClick={() => {
                            const s = cachedSheet<SheetIdea>(exam.id, signature);
                            if (s) s.scrollY = window.scrollY;
                            navigate({ name: 'chunk', noteId: x.noteId, index: x.part, highlight: [x.start, x.end] });
                          }}
                        >
                          <Icon name="book" size={20} />
                        </button>
                      </div>
                    </div>
                  </Paper>
                  {cheer && (
                    <CheerNote text={cheer.vpork ? t.vporkNote : t.cheers[cheer.message % t.cheers.length]} vpork={cheer.vpork} />
                  )}
                </Fragment>
              );
            })}
          </div>

          {shown.length < ranked.length ? (
            <div className="give-more">
              <PettableBiggu mood="read" size={84} className="corner-biggu" />
              <button className="btn btn-primary btn-big" onClick={() => setPages((p) => p + 1)}>
                {t.giveMore}
              </button>
            </div>
          ) : (
            <div className="all-read">
              <PettableBiggu mood="cheer" size={140} />
              <p className="big-status hand">{t.allRead}</p>
            </div>
          )}
        </>
      )}

      <NoteFilterDialog
        open={filterOpen}
        notes={sheetNotes}
        hidden={hidden}
        onApply={(next) => {
          applyFilter(next);
          setFilterOpen(false);
        }}
        onCancel={() => setFilterOpen(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={t.confirmDeleteExam}
        message={t.confirmDeleteExamBody(exam.title)}
        confirmLabel={t.delete}
        danger
        mood="sleepy"
        onConfirm={async () => {
          await examsStore.remove(user.uid, exam.id);
          forgetCramSheets(exam.id);
          clearTicks(exam.id);
          setConfirmDelete(false);
          onBack();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </main>
  );
}
