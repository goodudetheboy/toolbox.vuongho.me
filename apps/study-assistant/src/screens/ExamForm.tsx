import { useMemo, useState } from 'react';
import { Icon, Paper } from '../components/Scrap';
import TopBar from '../components/TopBar';
import { examsStore, todayIso } from '../lib/exams';
import type { AppUser, Exam, Note } from '../lib/types';
import { t } from '../strings';

type Pick = Exam['notes'][number];

/**
 * New / edit exam: a name, a date and which notes (or some of their parts) it covers.
 * `presetNoteId` ticks that note up front ("New exam with this note" on a note page).
 */
export default function ExamForm({
  user,
  notes,
  exam,
  presetNoteId,
  onSaved,
  onBack,
}: {
  user: AppUser;
  notes: Note[];
  exam?: Exam;
  presetNoteId?: string;
  onSaved: (examId: string) => void;
  onBack: () => void;
}) {
  const [title, setTitle] = useState(exam?.title ?? '');
  const [date, setDate] = useState(exam?.date ?? '');
  // In the order she picked them — that's the exam's order (ties on the cram sheet follow it).
  const [picks, setPicks] = useState<Pick[]>(
    () => exam?.notes ?? (presetNoteId && notes.some((n) => n.id === presetNoteId) ? [{ noteId: presetNoteId, parts: null }] : []),
  );
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => notes.filter((n) => !q || `${n.title} ${n.subject}`.toLowerCase().includes(q)),
    [notes, q],
  );
  const pickOf = (id: string) => picks.find((p) => p.noteId === id);
  const picked = picks.filter((p) => notes.some((n) => n.id === p.noteId));
  const ready = title.trim() !== '' && date !== '' && picked.length > 0 && !saving;

  function toggleNote(n: Note) {
    setPicks((ps) => (ps.some((p) => p.noteId === n.id) ? ps.filter((p) => p.noteId !== n.id) : [...ps, { noteId: n.id, parts: null }]));
  }

  function togglePart(n: Note, part: number) {
    setPicks((ps) => {
      const cur = ps.find((p) => p.noteId === n.id);
      const all = n.chunks.map((_, i) => i);
      const have = cur ? (cur.parts ?? all) : [];
      const next = have.includes(part) ? have.filter((i) => i !== part) : [...have, part].sort((a, b) => a - b);
      const rest = ps.filter((p) => p.noteId !== n.id);
      if (next.length === 0) return rest;
      const updated = { noteId: n.id, parts: next.length === all.length ? null : next };
      return cur ? ps.map((p) => (p.noteId === n.id ? updated : p)) : [...rest, updated];
    });
  }

  async function save() {
    if (!ready) return;
    setSaving(true);
    setFailed(false);
    const data = { title: title.trim(), date, notes: picked };
    try {
      if (exam) {
        await examsStore.update(user.uid, exam.id, data);
        onSaved(exam.id);
      } else {
        onSaved(await examsStore.create(user.uid, data));
      }
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  return (
    <main className="screen">
      <TopBar onBack={onBack} title={<span className="hand">{exam ? t.editExam : t.newExam}</span>} />

      <Paper tilt={-0.5} tape="yellow" className="exam-fields">
        <label className="exam-field">
          <span className="hand">{t.examName}</span>
          <input
            className="text-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.examNamePlaceholder}
            maxLength={60}
            autoFocus={!exam}
          />
        </label>
        <label className="exam-field">
          <span className="hand">{t.examDate}</span>
          <input className="text-input" type="date" value={date} min={exam ? undefined : todayIso()} onChange={(e) => setDate(e.target.value)} />
        </label>
      </Paper>

      <p className="ask hand">{t.whichNotes}</p>

      {notes.length === 0 ? (
        <p className="muted exams-empty">{t.noNotesYet}</p>
      ) : (
        <>
          <label className="search-field">
            <Icon name="search" size={22} />
            <input
              className="text-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchNotes}
              aria-label={t.searchNotes}
            />
          </label>

          <ol className="index-cards pick-list">
            {shown.map((n, i) => {
              const pick = pickOf(n.id);
              const on = !!pick;
              const total = n.chunks.length;
              const isOpen = expanded === n.id;
              return (
                <li key={n.id} style={{ transform: `rotate(${i % 2 ? 0.6 : -0.6}deg)` }}>
                  <div className={`index-card pick-card ${on ? 'on' : ''}`}>
                    <button className="pick-main" aria-pressed={on} onClick={() => toggleNote(n)}>
                      <span className={`pick-circle ${on ? 'on' : ''}`}>{on && <Icon name="check" size={24} />}</span>
                      <span className="pick-text">
                        <span className="index-title">{n.title}</span>
                        <span className="pick-subject">{n.subject}</span>
                      </span>
                    </button>
                    <button
                      className={`pick-parts ${pick?.parts ? 'some' : ''}`}
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : n.id)}
                    >
                      {!on ? t.parts(total) : pick.parts ? t.someParts(pick.parts.length, total) : t.allParts(total)} ›
                    </button>
                  </div>
                  {isOpen && (
                    <ul className="part-picks">
                      {n.chunks.map((c, k) => {
                        const partOn = on && (pick.parts === null || pick.parts.includes(k));
                        return (
                          <li key={k}>
                            <button aria-pressed={partOn} onClick={() => togglePart(n, k)}>
                              <span className={`pick-box ${partOn ? 'on' : ''}`}>{partOn && <Icon name="check" size={16} />}</span>
                              {k + 1} · {c.title}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
          {shown.length === 0 && <p className="muted exams-empty">{t.noNotesMatch(query.trim())}</p>}
          <p className="muted pick-hint">{t.pickHint}</p>
        </>
      )}

      {failed && <p className="error-text">{t.error}</p>}

      <div className="bottom-action">
        <button className="btn btn-primary btn-big" onClick={save} disabled={!ready}>
          {exam ? (
            t.save
          ) : (
            <>
              <Icon name="book" /> {t.makeCramSheet(picked.length)}
            </>
          )}
        </button>
      </div>
    </main>
  );
}
