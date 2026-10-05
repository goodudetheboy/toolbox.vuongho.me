import { useEffect, useMemo, useRef, useState } from 'react';
import Biggu from '../components/Biggu';
import { Icon, Paper } from '../components/Scrap';
import TopBar from '../components/TopBar';
import { api, ApiError, type PrepareInput } from '../lib/api';
import { ImportError, inputFromFiles } from '../lib/importNote';
import { notesStore } from '../lib/notes';
import type { AppUser } from '../lib/types';
import { t } from '../strings';

type Mode = 'paste' | 'file' | 'photo';

const METHODS: { mode: Mode; icon: 'paste' | 'file' | 'camera'; label: string; color: string }[] = [
  { mode: 'paste', icon: 'paste', label: t.paste, color: 'pink' },
  { mode: 'file', icon: 'file', label: t.file, color: 'yellow' },
  { mode: 'photo', icon: 'camera', label: t.photo, color: 'mint' },
];

// Progressive: first only "how?", then only that method's input, then the
// "Split into parts" button once there's something to split.
export default function NewNote({
  user,
  onBack,
  onCreated,
}: {
  user: AppUser;
  onBack: () => void;
  onCreated: (noteId: string, fidelityWarning: boolean) => void;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const previews = useMemo(() => (mode === 'photo' ? files.map((f) => URL.createObjectURL(f)) : []), [files, mode]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const ready = mode === 'paste' ? text.trim().length > 0 : files.length > 0;

  function choose(next: Mode) {
    setMode(next);
    setError(null);
    setFiles([]);
    if (next === 'file') fileInput.current?.click();
    if (next === 'photo') photoInput.current?.click();
  }

  async function submit() {
    if (!mode) return;
    setBusy(true);
    setError(null);
    const slowTimer = setTimeout(() => setSlow(true), 15000);
    try {
      const input: PrepareInput = mode === 'paste' ? { kind: 'text', text } : await inputFromFiles(files);
      const prepared = await api.prepare(input);
      const noteId = await notesStore.createNote(user.uid, {
        title: prepared.title,
        subject: prepared.subject,
        glossary: prepared.glossary,
        chunks: prepared.chunks.map((c) => ({ title: c.title, markdown: c.markdown })),
      });
      onCreated(noteId, prepared.fidelity !== null && prepared.fidelity < 0.7);
    } catch (err) {
      setError(
        err instanceof ImportError
          ? err.message === 'too-big'
            ? t.tooBig
            : t.unsupported
          : err instanceof ApiError && err.status === 0
            ? t.apiMissing
            : t.error,
      );
      setBusy(false);
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
    }
  }

  if (busy) {
    return (
      <main className="screen center">
        <Biggu mood="read" size={200} className="bob" />
        <p className="big-status hand">{slow ? t.preparingSlow : t.preparing}</p>
        <div className="dots-loader" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </main>
    );
  }

  const method = METHODS.find((m) => m.mode === mode);

  return (
    <main className="screen">
      <TopBar onBack={onBack} title={<span className="hand">{t.newLesson}</span>} />

      <input
        ref={fileInput}
        type="file"
        hidden
        accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        multiple
        onChange={(e) => setFiles([...(e.target.files ?? [])])}
      />
      <input
        ref={photoInput}
        type="file"
        hidden
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const picked = [...(e.target.files ?? [])];
          setFiles((prev) => [...prev, ...picked]);
          e.target.value = '';
        }}
      />

      {!method ? (
        <>
          <p className="ask hand">{t.howToAdd}</p>
          <div className="method-list">
            {METHODS.map((m, i) => (
              <button
                key={m.mode}
                className={`method-tile tile-${m.color}`}
                style={{ transform: `rotate(${[-1, 0.8, -0.5][i]}deg)` }}
                onClick={() => choose(m.mode)}
              >
                <span className="method-icon">
                  <Icon name={m.icon} size={36} />
                </span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="method-chosen">
            <span className={`method-chip tile-${method.color}`}>
              <Icon name={method.icon} size={22} /> {method.label}
            </span>
            <button className="text-btn" onClick={() => setMode(null)}>
              {t.change}
            </button>
          </div>

          {mode === 'paste' && (
            <Paper tilt={0.5} tape="yellow" lined className="paste-card">
              <textarea
                className="paste-area"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t.pastePlaceholder}
                autoFocus
              />
            </Paper>
          )}

          {mode !== 'paste' && files.length > 0 && (
            <Paper tilt={-0.8} tape="mint" className="files-card">
              <p className="hand files-count">{t.pickedFiles(files.length)}</p>
              {mode === 'photo' ? (
                <div className="thumbs">
                  {previews.map((src, i) => (
                    <img key={i} src={src} alt="" className="thumb" style={{ transform: `rotate(${i % 2 ? 3 : -3}deg)` }} />
                  ))}
                  <button className="thumb thumb-add" onClick={() => photoInput.current?.click()} aria-label={t.addPhoto}>
                    <Icon name="plus" size={30} />
                  </button>
                </div>
              ) : (
                <ul className="file-list">
                  {files.map((f, i) => (
                    <li key={i}>
                      <Icon name="file" size={20} /> {f.name}
                    </li>
                  ))}
                </ul>
              )}
            </Paper>
          )}

          {mode !== 'paste' && files.length === 0 && (
            <div className="pick-again">
              <button className="btn" onClick={() => (mode === 'file' ? fileInput : photoInput).current?.click()}>
                <Icon name={method.icon} /> {method.label}
              </button>
            </div>
          )}
        </>
      )}

      {error && <p className="error-text">{error}</p>}

      {ready && (
        <div className="bottom-action">
          <button className="btn btn-primary btn-big" onClick={submit}>
            <Icon name="book" /> {t.makeParts}
          </button>
        </div>
      )}
    </main>
  );
}
