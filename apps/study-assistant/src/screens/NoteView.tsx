import { useState } from 'react';
import AddToExamDialog from '../components/AddToExamDialog';
import Biggu from '../components/Biggu';
import { ConfirmDialog, PromptDialog } from '../components/Dialog';
import Menu from '../components/Menu';
import { Icon, ScoreStamp } from '../components/Scrap';
import TopBar from '../components/TopBar';
import { notesStore } from '../lib/notes';
import type { Route } from '../lib/router';
import type { AppUser, Exam, Note } from '../lib/types';
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
  exams,
  fidelityWarning,
  navigate,
  onBack,
}: {
  user: AppUser;
  note: Note;
  exams: Exam[];
  fidelityWarning: boolean;
  navigate: (r: Route) => void;
  onBack: () => void;
}) {
  const [dialog, setDialog] = useState<'exam' | 'rename' | 'delete' | null>(null);
  const closeDialog = () => setDialog(null);
  const up = nextUp(note);
  const open = (index: number) => navigate({ name: 'chunk', noteId: note.id, index });

  return (
    <main className="screen">
      <TopBar
        onBack={onBack}
        title={<span className="hand title-ellipsis">{note.title}</span>}
        right={
          <Menu
            items={[
              { label: t.addToExam, icon: <Icon name="calendar" size={20} />, onSelect: () => setDialog('exam') },
              { label: t.rename, icon: <Icon name="pencil" size={20} />, onSelect: () => setDialog('rename') },
              { label: t.deleteLesson, icon: <Icon name="trash" size={20} />, onSelect: () => setDialog('delete'), danger: true },
            ]}
          />
        }
      />

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

      <AddToExamDialog
        open={dialog === 'exam'}
        user={user}
        note={note}
        exams={exams}
        onNewExam={() => {
          closeDialog();
          navigate({ name: 'newExam', noteId: note.id });
        }}
        onClose={closeDialog}
      />
      <PromptDialog
        open={dialog === 'rename'}
        title={t.rename}
        label={t.renamePrompt}
        initial={note.title}
        confirmLabel={t.save}
        onSubmit={async (title) => {
          await notesStore.updateNote(user.uid, note.id, { title });
          closeDialog();
        }}
        onCancel={closeDialog}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        title={t.confirmDelete}
        message={t.confirmDeleteBody(note.title)}
        confirmLabel={t.delete}
        danger
        mood="sleepy"
        onConfirm={async () => {
          await notesStore.deleteNote(user.uid, note);
          closeDialog();
          onBack();
        }}
        onCancel={closeDialog}
      />

      <div className="bottom-action">
        <button className="btn btn-primary btn-big" onClick={() => open(up)}>
          {t.part(up + 1, note.chunks.length)} <Icon name="next" />
        </button>
      </div>
    </main>
  );
}
