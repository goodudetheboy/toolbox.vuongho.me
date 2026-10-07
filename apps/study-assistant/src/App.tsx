import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import Biggu from './components/Biggu';
import GuideCards from './components/GuideCards';
import { Icon } from './components/Scrap';
import TopBar from './components/TopBar';
import { useAuth } from './lib/auth';
import { dropPartFromExams, examsStore } from './lib/exams';
import { isAdmin } from './lib/feedback';
import { loadGuideSeen, markGuideSeen } from './lib/guide';
import { hasLegacyHistory, notesStore, partId } from './lib/notes';
import { useRoute } from './lib/router';
import { touchProfile } from './lib/usage';
import type { Exam, Note } from './lib/types';
import CramSheet from './screens/CramSheet';
import ExamForm from './screens/ExamForm';
import Home, { savedHomeTab } from './screens/Home';
import SendFeedback from './screens/SendFeedback';
import NewNote from './screens/NewNote';
import NoteView from './screens/NoteView';
import Progress from './screens/Progress';
import SignIn from './screens/SignIn';
import Study from './screens/Study';
import { t } from './strings';

// The editor pulls in marked + turndown; only load them when she edits.
const EditPart = lazy(() => import('./screens/EditPart'));
// Admin-only feedback viewer — no reason to ship it to her phone up front.
const Admin = lazy(() => import('./screens/Admin'));

export default function App() {
  const { user, loading } = useAuth();
  const { route, navigate, goBack } = useRoute();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [denied, setDenied] = useState(false);
  // Has she seen "How it works"? null while checking.
  const [guideSeen, setGuideSeen] = useState<boolean | null>(null);
  // Shown once on the note page right after a pasted/Word note came back not quite word-for-word.
  const [fidelityWarningFor, setFidelityWarningFor] = useState<string | null>(null);

  // Last-seen + open count for the admin usage tab; a failed write doesn't matter.
  useEffect(() => {
    if (user) touchProfile(user).catch(() => {});
  }, [user]);

  useEffect(() => {
    setNotes(null);
    setDenied(false);
    if (!user) return;
    return notesStore.subscribeNotes(user.uid, setNotes, (err) => {
      // Firestore rules only admit allowlisted emails — anyone else lands here.
      if ((err as { code?: string }).code === 'permission-denied') setDenied(true);
    });
  }, [user]);

  useEffect(() => {
    setGuideSeen(null);
    if (!user) return;
    let live = true;
    loadGuideSeen(user).then((seen) => live && setGuideSeen(seen));
    return () => {
      live = false;
    };
  }, [user]);

  useEffect(() => {
    setExams(null);
    if (!user) return;
    return examsStore.subscribe(user.uid, setExams, () => setExams([]));
  }, [user]);

  // Opening the app on Home lands on the tab she used last.
  useEffect(() => {
    if (route.name === 'home' && savedHomeTab() === 'exams') navigate({ name: 'exams' }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on launch
  }, []);

  // Notes saved by older versions kept score history on the note; move it out once.
  const migrated = useRef(new Set<string>());
  useEffect(() => {
    if (!user || !notes) return;
    for (const n of notes) {
      if (!hasLegacyHistory(n) || migrated.current.has(n.id)) continue;
      migrated.current.add(n.id);
      notesStore.migrateLegacyHistory(user.uid, n).catch(() => migrated.current.delete(n.id));
    }
  }, [user, notes]);

  if (loading) {
    return (
      <main className="screen center">
        <Biggu mood="sleepy" size={160} className="bob" />
      </main>
    );
  }
  if (!user || denied) return <SignIn notAllowed={denied} />;

  const home = { name: 'home' } as const;
  const guideDone = () => {
    markGuideSeen(user);
    setGuideSeen(true);
  };

  const closeGuide = (onClose: () => void) => (
    <button className="icon-btn" onClick={onClose} aria-label={t.guide.close}>
      <Icon name="close" />
    </button>
  );

  if (route.name === 'howItWorks') {
    const leave = () => {
      guideDone();
      goBack(home);
    };
    return (
      <main className="screen">
        <TopBar title={<span className="hand">{t.howItWorks}</span>} right={closeGuide(leave)} />
        <GuideCards finishLabel={t.guide.done} onFinish={leave} />
      </main>
    );
  }

  // First time in: the cards once. With no notes yet, finishing goes straight to adding one.
  if ((route.name === 'home' || route.name === 'exams') && guideSeen === false && notes) {
    const empty = notes.length === 0;
    return (
      <main className="screen">
        <TopBar title={<span className="hand">{t.howItWorks}</span>} right={closeGuide(guideDone)} />
        <GuideCards
          finishLabel={empty ? t.firstLesson : t.guide.start}
          onFinish={() => {
            guideDone();
            if (empty) navigate({ name: 'new' });
          }}
        />
      </main>
    );
  }

  if (route.name === 'new') {
    return (
      <NewNote
        user={user}
        onBack={() => goBack(home)}
        onCreated={(noteId, warn) => {
          if (warn) setFidelityWarningFor(noteId);
          navigate({ name: 'note', noteId }, { replace: true });
        }}
      />
    );
  }

  if (route.name === 'admin') {
    return (
      <Suspense
        fallback={
          <main className="screen center">
            <Biggu mood="think" size={160} className="bob" />
          </main>
        }
      >
        <Admin user={user} tab={route.tab} navigate={navigate} onBack={() => goBack(home)} />
      </Suspense>
    );
  }

  const loadingScreen = (
    <main className="screen center">
      <Biggu mood="read" size={160} className="bob" />
    </main>
  );
  const examsHome = { name: 'exams' } as const;

  if (route.name === 'sendFeedback') {
    return <SendFeedback user={user} onBack={() => goBack(home)} />;
  }

  if (route.name === 'newExam' || route.name === 'editExam') {
    if (!notes || !exams) return loadingScreen;
    const exam = route.name === 'editExam' ? exams.find((x) => x.id === route.examId) : undefined;
    if (route.name === 'editExam' && !exam) {
      return (
        <main className="screen center">
          <Biggu mood="think" size={160} />
          <p className="big-status hand">{t.examNotFound}</p>
          <button className="btn" onClick={() => navigate(examsHome, { replace: true })}>
            {t.back}
          </button>
        </main>
      );
    }
    return (
      <ExamForm
        key={route.name === 'editExam' ? route.examId : `new-${route.noteId ?? ''}`}
        user={user}
        notes={notes}
        exam={exam}
        presetNoteId={route.name === 'newExam' ? route.noteId : undefined}
        onSaved={(examId) =>
          exam ? goBack({ name: 'exam', examId }) : navigate({ name: 'exam', examId }, { replace: true })
        }
        onBack={() => goBack(exam ? { name: 'exam', examId: exam.id } : examsHome)}
      />
    );
  }

  if (route.name === 'exam') {
    if (!notes || !exams) return loadingScreen;
    const exam = exams.find((x) => x.id === route.examId);
    if (!exam) {
      return (
        <main className="screen center">
          <Biggu mood="think" size={160} />
          <p className="big-status hand">{t.examNotFound}</p>
          <button className="btn" onClick={() => navigate(examsHome, { replace: true })}>
            {t.back}
          </button>
        </main>
      );
    }
    return <CramSheet key={exam.id} user={user} exam={exam} notes={notes} navigate={navigate} onBack={() => goBack(examsHome)} />;
  }

  if (route.name === 'note' || route.name === 'chunk' || route.name === 'edit' || route.name === 'progress') {
    const note = notes?.find((n) => n.id === route.noteId);
    if (!notes) {
      return (
        <main className="screen center">
          <Biggu mood="read" size={160} className="bob" />
        </main>
      );
    }
    if (!note || (route.name !== 'note' && !note.chunks[route.index])) {
      return (
        <main className="screen center">
          <Biggu mood="think" size={160} />
          <p className="big-status hand">{t.notFound}</p>
          <button className="btn" onClick={() => navigate(home, { replace: true })}>
            {t.back}
          </button>
        </main>
      );
    }
    if (route.name === 'edit') {
      const back = { name: 'chunk', noteId: note.id, index: route.index } as const;
      return (
        <Suspense
          fallback={
            <main className="screen center">
              <Biggu mood="think" size={160} className="bob" />
            </main>
          }
        >
          <EditPart
            key={`${note.id}-${route.index}`}
            user={user}
            note={note}
            index={route.index}
            onDone={() => goBack(back)}
          />
        </Suspense>
      );
    }
    if (route.name === 'progress') {
      return (
        <Progress
          key={`${note.id}-${route.index}`}
          user={user}
          note={note}
          index={route.index}
          onBack={() => goBack({ name: 'chunk', noteId: note.id, index: route.index })}
        />
      );
    }
    if (route.name === 'chunk') {
      return (
        <Study
          key={`${note.id}-${route.index}`}
          user={user}
          note={note}
          index={route.index}
          highlight={route.highlight}
          navigate={navigate}
          onBack={() => goBack({ name: 'note', noteId: note.id })}
          onDeletePart={
            note.chunks.length > 1
              ? () => {
                  const index = route.index;
                  const id = partId(note, index);
                  // Leave first, so this screen never shows the part that slides into this slot.
                  goBack({ name: 'note', noteId: note.id });
                  void Promise.all([
                    notesStore.deleteChunk(user.uid, note, index),
                    dropPartFromExams(user.uid, exams ?? [], note.id, id),
                  ]).catch(() => {});
                }
              : undefined
          }
        />
      );
    }
    return (
      <NoteView
        user={user}
        note={note}
        exams={exams ?? []}
        fidelityWarning={fidelityWarningFor === note.id}
        navigate={navigate}
        onBack={() => goBack(home)}
      />
    );
  }

  return (
    <Home
      notes={notes}
      exams={exams}
      tab={route.name === 'exams' ? 'exams' : 'notes'}
      userName={user.name || user.email?.split('@')[0] || ''}
      admin={isAdmin(user.email)}
      navigate={navigate}
    />
  );
}
