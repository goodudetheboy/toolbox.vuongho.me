import { useState } from 'react';
import { daysUntil, examsStore, sortExams } from '../lib/exams';
import type { AppUser, Exam, Note } from '../lib/types';
import { t } from '../strings';
import { Modal } from './Dialog';
import { Icon } from './Scrap';

/**
 * From a note's ⋯ menu: tick the exams this note is on. Each tap saves straight away
 * (adds the whole note, or takes it off); "New exam with this note" opens the exam form.
 */
export default function AddToExamDialog({
  open,
  user,
  note,
  exams,
  onNewExam,
  onClose,
}: {
  open: boolean;
  user: AppUser;
  note: Note;
  exams: Exam[];
  onNewExam: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function toggle(exam: Exam) {
    const on = exam.notes.some((p) => p.noteId === note.id);
    setBusy(exam.id);
    setFailed(false);
    try {
      await examsStore.update(user.uid, exam.id, {
        notes: on ? exam.notes.filter((p) => p.noteId !== note.id) : [...exam.notes, { noteId: note.id, parts: null }],
      });
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open={open} mood="read" title={t.addToExamTitle} onCancel={onClose} onSubmit={onClose}>
      {exams.length === 0 ? (
        <p className="modal-message">{t.noExamsToAdd}</p>
      ) : (
        <ul className="exam-picks">
          {sortExams(exams).map((x) => {
            const on = x.notes.some((p) => p.noteId === note.id);
            return (
              <li key={x.id}>
                <button type="button" aria-pressed={on} disabled={busy !== null} onClick={() => toggle(x)}>
                  <span className={`pick-circle small ${on ? 'on' : ''}`}>{on && <Icon name="check" size={20} />}</span>
                  <span className="exam-pick-title hand">{x.title}</span>
                  <span className="exam-pick-when">{t.daysTo(daysUntil(x.date))}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="text-btn" onClick={onNewExam}>
        <Icon name="plus" size={20} /> {t.newExamWithNote}
      </button>
      {failed && <p className="error-text">{t.error}</p>}
      <div className="modal-actions">
        <button type="submit" className="btn btn-primary">
          {t.done}
        </button>
      </div>
    </Modal>
  );
}
