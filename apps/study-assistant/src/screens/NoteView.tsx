import { Fragment, useState } from 'react';
import AddToExamDialog from '../components/AddToExamDialog';
import Biggu from '../components/Biggu';
import { ConfirmDialog, PromptDialog } from '../components/Dialog';
import Menu from '../components/Menu';
import { Icon, Paper, ScoreStamp } from '../components/Scrap';
import TopBar from '../components/TopBar';
import { dropPartFromExams } from '../lib/exams';
import { moveChunk, notesStore, partId } from '../lib/notes';
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
  editing = false,
  navigate,
  onBack,
}: {
  user: AppUser;
  note: Note;
  exams: Exam[];
  fidelityWarning: boolean;
  /** "Edit parts" mode (its own history entry, so Back leaves it). */
  editing?: boolean;
  navigate: (r: Route) => void;
  onBack: () => void;
}) {
  const [dialog, setDialog] = useState<'exam' | 'rename' | 'delete' | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const closeDialog = () => setDialog(null);
  const up = nextUp(note);
  const open = (index: number) => navigate({ name: 'chunk', noteId: note.id, index });
  const edit = (index: number) => navigate({ name: 'edit', noteId: note.id, index });
  const addAt = (at: number) => navigate({ name: 'newPart', noteId: note.id, at });
  const move = (from: number, to: number) => void moveChunk(user.uid, note, from, to).catch(() => {});

  if (editing) {
    return (
      <main className="screen">
        <TopBar onBack={onBack} title={<span className="hand title-ellipsis">{t.editParts}</span>} />
        <p className="edit-hint">
          <Icon name="pencil" size={20} /> {t.editPartsHint}
        </p>
        <ol className="index-cards">
          {note.chunks.map((c, i) => (
            <Fragment key={partId(note, i)}>
              {i > 0 && (
                <li className="seam">
                  <button onClick={() => addAt(i)} aria-label={t.addPartHere} title={t.addPartHere}>
                    <Icon name="plus" size={18} />
                  </button>
                </li>
              )}
              <li style={{ transform: `rotate(${i % 2 ? 0.6 : -0.6}deg)` }}>
                <div className="index-card editing">
                  <span className="part-move">
                    <button disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={t.moveUp} title={t.moveUp}>
                      <Icon name="chevron-up" size={18} />
                    </button>
                    <button disabled={i === note.chunks.length - 1} onClick={() => move(i, i + 1)} aria-label={t.moveDown} title={t.moveDown}>
                      <Icon name="chevron" size={18} />
                    </button>
                  </span>
                  <button className="index-edit-body" onClick={() => edit(i)}>
                    <span className="index-num">{i + 1}</span>
                    <span className="index-title">{c.title}</span>
                  </button>
                  <span className="part-tools">
                    <button className="part-tool" onClick={() => edit(i)} aria-label={t.edit} title={t.edit}>
                      <Icon name="pencil" size={20} />
                    </button>
                    <button className="part-tool danger" onClick={() => setDeleting(i)} aria-label={t.deletePart} title={t.deletePart}>
                      <Icon name="trash" size={20} />
                    </button>
                  </span>
                </div>
              </li>
            </Fragment>
          ))}
          <li style={{ transform: 'rotate(-0.4deg)' }}>
            <button className="index-card add-card" onClick={() => addAt(note.chunks.length)}>
              <span className="index-num">
                <Icon name="plus" size={24} />
              </span>
              <span className="index-title">{t.addPartAtEnd}</span>
            </button>
          </li>
        </ol>

        <ConfirmDialog
          open={deleting !== null}
          title={t.confirmDeletePart}
          message={deleting !== null ? t.confirmDeletePartBody(note.chunks[deleting]?.title ?? '') : undefined}
          confirmLabel={t.delete}
          danger
          mood="sleepy"
          onConfirm={async () => {
            if (deleting === null) return;
            const id = partId(note, deleting);
            setDeleting(null);
            await Promise.all([notesStore.deleteChunk(user.uid, note, deleting), dropPartFromExams(user.uid, exams, note.id, id)]).catch(() => {});
          }}
          onCancel={() => setDeleting(null)}
        />

        <div className="bottom-action">
          <button className="btn btn-primary btn-big" onClick={onBack}>
            <Icon name="check" /> {t.done}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="screen">
      <TopBar
        onBack={onBack}
        title={<span className="hand title-ellipsis">{note.title}</span>}
        right={
          <Menu
            items={[
              { label: t.editParts, icon: <Icon name="pencil" size={20} />, onSelect: () => navigate({ name: 'note', noteId: note.id, editing: true }) },
              ...(note.chunks.length
                ? [{ label: t.addToExam, icon: <Icon name="calendar" size={20} />, onSelect: () => setDialog('exam') }]
                : []),
              { label: t.rename, icon: <Icon name="pencil" size={20} />, onSelect: () => setDialog('rename') },
              { label: t.deleteLesson, icon: <Icon name="trash" size={20} />, onSelect: () => setDialog('delete'), danger: true },
            ]}
          />
        }
      />

      <div className="note-head">
        {note.subject && <span className="subject-sticker">{note.subject}</span>}
        <span className="muted">{t.parts(note.chunks.length)}</span>
      </div>

      {fidelityWarning && (
        <div className="warning-note">
          <Biggu mood="think" size={56} />
          <span>{t.fidelityWarning}</span>
        </div>
      )}

      {note.chunks.length === 0 && (
        <Paper tilt={-0.6} tape="lilac" className="no-parts">
          <Biggu mood="think" size={96} />
          <p className="hand no-parts-title">{t.noParts}</p>
        </Paper>
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
        <li style={{ transform: 'rotate(-0.4deg)' }}>
          <button className="index-card add-card" onClick={() => addAt(note.chunks.length)}>
            <span className="index-num">
              <Icon name="plus" size={24} />
            </span>
            <span className="index-title">{t.addAPart}</span>
          </button>
        </li>
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
        {note.chunks.length === 0 ? (
          <button className="btn btn-primary btn-big" onClick={() => addAt(0)}>
            <Icon name="plus" /> {t.addAPart}
          </button>
        ) : (
          <button className="btn btn-primary btn-big" onClick={() => open(up)}>
            {t.part(up + 1, note.chunks.length)} <Icon name="next" />
          </button>
        )}
      </div>
    </main>
  );
}
