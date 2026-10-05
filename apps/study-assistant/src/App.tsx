import { lazy, Suspense, useEffect, useState } from 'react';
import Biggu from './components/Biggu';
import { useAuth } from './lib/auth';
import { notesStore } from './lib/notes';
import { useRoute } from './lib/router';
import type { Note } from './lib/types';
import Home from './screens/Home';
import NewNote from './screens/NewNote';
import NoteView from './screens/NoteView';
import SignIn from './screens/SignIn';
import Study from './screens/Study';
import { t } from './strings';

// The editor pulls in marked + turndown; only load them when she edits.
const EditPart = lazy(() => import('./screens/EditPart'));

export default function App() {
  const { user, loading } = useAuth();
  const { route, navigate, goBack } = useRoute();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [denied, setDenied] = useState(false);
  // Shown once on the note page right after a pasted/Word note came back not quite word-for-word.
  const [fidelityWarningFor, setFidelityWarningFor] = useState<string | null>(null);

  useEffect(() => {
    setNotes(null);
    setDenied(false);
    if (!user) return;
    return notesStore.subscribeNotes(user.uid, setNotes, (err) => {
      // Firestore rules only admit allowlisted emails — anyone else lands here.
      if ((err as { code?: string }).code === 'permission-denied') setDenied(true);
    });
  }, [user]);

  if (loading) {
    return (
      <main className="screen center">
        <Biggu mood="sleepy" size={160} className="bob" />
      </main>
    );
  }
  if (!user || denied) return <SignIn notAllowed={denied} />;

  const home = { name: 'home' } as const;

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

  if (route.name === 'note' || route.name === 'chunk' || route.name === 'edit') {
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
    if (route.name === 'chunk') {
      return (
        <Study
          key={`${note.id}-${route.index}`}
          user={user}
          note={note}
          index={route.index}
          navigate={navigate}
          onBack={() => goBack({ name: 'note', noteId: note.id })}
        />
      );
    }
    return (
      <NoteView
        user={user}
        note={note}
        fidelityWarning={fidelityWarningFor === note.id}
        navigate={navigate}
        onBack={() => goBack(home)}
      />
    );
  }

  return <Home notes={notes} navigate={navigate} />;
}
