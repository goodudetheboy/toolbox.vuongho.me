import { useState, useEffect, useRef, useCallback } from 'react';
import type { QueuedFile, TranscriptRecord, TranscriptSegment, AppSettings, WorkerInMessage, WorkerOutMessage, ComputeDevice } from './types';
import { saveTranscript, getAllTranscripts, deleteTranscript } from './lib/storage';
import DropZone from './components/DropZone';
import FileQueue from './components/FileQueue';
import TranscriptViewer from './components/TranscriptViewer';
import HistoryPanel from './components/HistoryPanel';
import SettingsModal from './components/SettingsModal';

const DEFAULT_SETTINGS: AppSettings = {
  model: 'Xenova/whisper-base.en',
  device: 'webgpu',
};

export default function App() {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [history, setHistory] = useState<TranscriptRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [computeMode, setComputeMode] = useState<ComputeDevice | null>(null);
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const settingsRef = useRef(settings);
  const computeModeRef = useRef(computeMode);
  const processingRef = useRef<string | null>(null);
  const filesRef = useRef(files);
  const activeFileIdRef = useRef(activeFileId);
  const hasUnsavedEditsRef = useRef(hasUnsavedEdits);
  // Accumulates segments across chunks keyed by file id
  const chunkAccRef = useRef<Map<string, { segments: TranscriptSegment[]; createdAt: number; filename: string }>>(new Map());

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { computeModeRef.current = computeMode; }, [computeMode]);
  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { activeFileIdRef.current = activeFileId; }, [activeFileId]);
  useEffect(() => { hasUnsavedEditsRef.current = hasUnsavedEdits; }, [hasUnsavedEdits]);

  const confirmDiscard = useCallback(
    () => !hasUnsavedEdits || window.confirm('Discard unsaved changes?'),
    [hasUnsavedEdits],
  );

  // Detect WebGPU at startup so the default device is accurate
  useEffect(() => {
    if (!('gpu' in navigator)) {
      setSettings(s => ({ ...s, device: 'wasm' }));
    }
  }, []);

  // Load history from IndexedDB
  useEffect(() => {
    getAllTranscripts().then(setHistory).catch(console.error);
  }, []);

  // Initialize worker
  useEffect(() => {
    const worker = new Worker(
      new URL('./workers/transcription.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data;

      if (msg.type === 'MODEL_LOADING') {
        setFiles(prev => prev.map(f =>
          f.id === msg.id
            ? { ...f, progressLabel: `Loading model… ${Math.round(msg.progress)}%`, progress: msg.progress / 100 }
            : f,
        ));
        return;
      }

      if (msg.type === 'DEVICE_DETECTED') {
        setComputeMode(msg.device);
        return;
      }

      if (msg.type === 'EXTRACTING') {
        setFiles(prev => prev.map(f =>
          f.id === msg.id
            ? { ...f, status: 'extracting', progressLabel: 'Extracting audio…', progress: 0 }
            : f,
        ));
        return;
      }

      if (msg.type === 'TRANSCRIBING') {
        setFiles(prev => prev.map(f =>
          f.id === msg.id
            ? {
                ...f,
                status: 'transcribing',
                progress: 0,
                progressLabel: msg.totalChunks > 1
                  ? `Transcribing… 0 of ${msg.totalChunks} chunks`
                  : 'Transcribing…',
              }
            : f,
        ));
        return;
      }

      if (msg.type === 'CHUNK_DONE') {
        const file = filesRef.current.find(f => f.id === msg.id);
        const filename = file?.file.name ?? chunkAccRef.current.get(msg.id)?.filename ?? 'audio';
        const existing = chunkAccRef.current.get(msg.id) ?? { segments: [], createdAt: Date.now(), filename };
        const allSegments = [...existing.segments, ...msg.segments];
        chunkAccRef.current.set(msg.id, { segments: allSegments, createdAt: existing.createdAt, filename });

        const record: TranscriptRecord = {
          id: msg.id,
          filename,
          createdAt: existing.createdAt,
          model: settingsRef.current.model,
          computeMode: computeModeRef.current ?? 'wasm',
          segments: allSegments,
        };

        saveTranscript(record).catch(console.error);

        setHistory(h => {
          const exists = h.some(r => r.id === msg.id);
          return exists ? h.map(r => r.id === msg.id ? record : r) : [record, ...h];
        });

        if (msg.chunkIndex === 0) {
          const switchingAway = activeFileIdRef.current !== null && activeFileIdRef.current !== msg.id;
          if (!(switchingAway && hasUnsavedEditsRef.current)) setActiveFileId(msg.id);
        }

        setFiles(prev => prev.map(f => f.id === msg.id ? {
          ...f,
          status: 'transcribing',
          progress: (msg.chunkIndex + 1) / msg.totalChunks,
          progressLabel: msg.totalChunks > 1
            ? `Transcribing… chunk ${msg.chunkIndex + 1} of ${msg.totalChunks}`
            : 'Transcribing…',
          transcript: record,
        } : f));
        return;
      }

      if (msg.type === 'DONE') {
        processingRef.current = null;
        chunkAccRef.current.delete(msg.id);
        setFiles(prev => prev.map(f =>
          f.id === msg.id ? { ...f, status: 'done', progress: 1, progressLabel: undefined } : f,
        ));
        return;
      }

      if (msg.type === 'ERROR') {
        processingRef.current = null;
        setFiles(prev => prev.map(f =>
          f.id === msg.id
            ? { ...f, status: 'error', progressLabel: undefined, error: msg.error }
            : f,
        ));
      }
    };

    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  // Queue processor — picks the next pending file when nothing is running
  useEffect(() => {
    if (!workerRef.current || processingRef.current) return;
    const next = files.find(f => f.status === 'pending');
    if (!next) return;

    processingRef.current = next.id;
    setFiles(prev => prev.map(f =>
      f.id === next.id ? { ...f, status: 'extracting', progressLabel: 'Starting…', progress: 0 } : f,
    ));

    workerRef.current.postMessage({
      type: 'TRANSCRIBE',
      id: next.id,
      file: next.file,
      model: settings.model,
      device: settings.device,
    } as WorkerInMessage);
  }, [files, settings]);

  const addFiles = useCallback((newFiles: File[]) => {
    const items: QueuedFile[] = newFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      status: 'pending',
      progress: 0,
    }));
    setFiles(prev => [...prev, ...items]);
  }, []);

  const removeFile = useCallback((id: string) => {
    if (id === activeFileId && !confirmDiscard()) return;
    chunkAccRef.current.delete(id);
    setFiles(prev => prev.filter(f => f.id !== id));
    setActiveFileId(prev => (prev === id ? null : prev));
  }, [activeFileId, confirmDiscard]);

  const handleDeleteHistory = useCallback(async (id: string) => {
    if (id === activeFileId && !confirmDiscard()) return;
    await deleteTranscript(id);
    setHistory(h => h.filter(r => r.id !== id));
    setActiveFileId(prev => (prev === id ? null : prev));
  }, [activeFileId, confirmDiscard]);

  const handleUpdateTranscript = useCallback((updated: TranscriptRecord) => {
    // Update state immediately (matching the CHUNK_DONE pattern above) rather than
    // awaiting the IndexedDB write first — awaiting first leaves a window where a
    // second edit fired before this one's state update lands would read stale props
    // and clobber this edit when it saves.
    setHistory(h => (h.some(r => r.id === updated.id) ? h.map(r => (r.id === updated.id ? updated : r)) : [updated, ...h]));
    setFiles(prev => prev.map(f => (f.id === updated.id ? { ...f, transcript: updated } : f)));
    saveTranscript(updated).catch(console.error);
  }, []);

  // Active transcript: prefer queue file's transcript, fall back to history
  const activeFile = files.find(f => f.id === activeFileId);
  const activeTranscript = activeFile?.transcript ?? history.find(r => r.id === activeFileId);
  // Editing is only safe once transcription has fully finished — CHUNK_DONE messages
  // rebuild files[].transcript straight from the raw worker output and would silently
  // clobber any in-progress edits made while a file is still transcribing.
  const activeTranscriptEditable = !activeFile || activeFile.status === 'done';

  return (
    <div className="app">
      <header className="header">
        <a className="back-link" href="/">
          ← Back to Toolbox
        </a>
        <div className="header-brand">
          <svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="64" height="64" rx="16" fill="#ff8a65"/>
            <rect x="26" y="10" width="12" height="24" rx="6" fill="white"/>
            <path d="M18 30c0 7.732 6.268 14 14 14s14-6.268 14-14" stroke="white" strokeWidth="3" strokeLinecap="round"/>
            <line x1="32" y1="44" x2="32" y2="52" stroke="white" strokeWidth="3" strokeLinecap="round"/>
            <line x1="24" y1="52" x2="40" y2="52" stroke="white" strokeWidth="3" strokeLinecap="round"/>
          </svg>
          Transcriber
        </div>
        <div className="header-actions">
          {computeMode && (
            <span className={`badge badge-${computeMode}`}>
              {computeMode === 'webgpu' ? '⚡ GPU' : '⬜ CPU'}
            </span>
          )}
          <button className="btn-icon" title="Settings" onClick={() => setShowSettings(true)}>
            ⚙️
          </button>
          <button className="btn-secondary" onClick={() => setShowHistory(true)}>
            History
          </button>
        </div>
      </header>

      <main className="main">
        <DropZone onFiles={addFiles} hasFiles={files.length > 0} />

        {(files.length > 0 || activeTranscript) && (
          <div className={`workspace ${files.length === 0 ? 'workspace-single' : ''}`}>
            {files.length > 0 && (
              <FileQueue
                files={files}
                activeId={activeFileId}
                onSelect={id => { if (confirmDiscard()) setActiveFileId(id); }}
                onRemove={removeFile}
              />
            )}
            <TranscriptViewer
              transcript={activeTranscript}
              editable={activeTranscriptEditable}
              onUpdateTranscript={handleUpdateTranscript}
              onDirtyChange={setHasUnsavedEdits}
            />
          </div>
        )}
      </main>

      {showHistory && (
        <HistoryPanel
          history={history}
          activeId={activeFileId}
          onSelect={id => { if (confirmDiscard()) { setActiveFileId(id); setShowHistory(false); } }}
          onDelete={handleDeleteHistory}
          onClose={() => setShowHistory(false)}
        />
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
