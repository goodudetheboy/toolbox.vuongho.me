import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Cpu, Settings, Zap } from 'lucide-react';
import type { QueuedFile, TranscriptRecord, TranscriptSegment, AppSettings, WorkerInMessage, WorkerOutMessage, ComputeDevice, PickedFile } from './types';
import { saveTranscript, getAllTranscripts, deleteTranscript, saveMediaHandle } from './lib/storage';
import { useRecording } from './lib/useRecording';
import { decoderPoolSize } from './lib/poolSize';
import { createTranscriber, type Transcriber } from './lib/transcriber';
import DropZone from './components/DropZone';
import FileQueue from './components/FileQueue';
import TranscriptViewer from './components/TranscriptViewer';
import HistoryPanel from './components/HistoryPanel';
import SettingsModal from './components/SettingsModal';

const DEFAULT_SETTINGS: AppSettings = {
  model: 'Xenova/whisper-base.en',
  device: 'webgpu',
};

function transcribingLabel(completed: number, total: number, workers: number): string {
  const pct = total ? Math.round((completed / total) * 100) : 0;
  return `Transcribing… ${pct}%${workers > 1 ? ` · ${workers} workers` : ''}`;
}

export default function App() {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [history, setHistory] = useState<TranscriptRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [computeMode, setComputeMode] = useState<ComputeDevice | null>(null);
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);

  const workerRef = useRef<Transcriber | null>(null);
  const settingsRef = useRef(settings);
  const computeModeRef = useRef(computeMode);
  const processingRef = useRef<string | null>(null);
  const filesRef = useRef(files);
  const activeFileIdRef = useRef(activeFileId);
  const hasUnsavedEditsRef = useRef(hasUnsavedEdits);
  const historyRef = useRef(history);
  // Per-file record metadata that must stay stable across progress updates
  const recordMetaRef = useRef<Map<string, { createdAt: number; filename: string }>>(new Map());
  const workerCountRef = useRef(1);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { computeModeRef.current = computeMode; }, [computeMode]);
  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { activeFileIdRef.current = activeFileId; }, [activeFileId]);
  useEffect(() => { hasUnsavedEditsRef.current = hasUnsavedEdits; }, [hasUnsavedEdits]);
  useEffect(() => { historyRef.current = history; }, [history]);

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

  // Saves the merged-so-far transcript for a file (each update replaces the
  // segments wholesale) and auto-selects the file the first time it has text.
  const publishSegments = useCallback((id: string, segments: TranscriptSegment[]): TranscriptRecord => {
    const file = filesRef.current.find(f => f.id === id);
    let meta = recordMetaRef.current.get(id);
    const isFirst = !meta;
    if (!meta) {
      // A retried file keeps its original history entry's createdAt
      const prior = historyRef.current.find(r => r.id === id);
      meta = { createdAt: prior?.createdAt ?? Date.now(), filename: file?.file.name ?? prior?.filename ?? 'audio' };
      recordMetaRef.current.set(id, meta);
    }

    const record: TranscriptRecord = {
      id,
      filename: meta.filename,
      createdAt: meta.createdAt,
      model: settingsRef.current.model,
      computeMode: computeModeRef.current ?? 'wasm',
      segments,
    };

    saveTranscript(record).catch(console.error);
    setHistory(h => (h.some(r => r.id === id) ? h.map(r => (r.id === id ? record : r)) : [record, ...h]));

    if (isFirst) {
      // Persist only a pointer to the original file (not its bytes) so the
      // recording can be reopened for playback from history later.
      if (file?.handle) saveMediaHandle(id, file.handle).catch(console.error);
      const switchingAway = activeFileIdRef.current !== null && activeFileIdRef.current !== id;
      if (!(switchingAway && hasUnsavedEditsRef.current)) setActiveFileId(id);
    }
    return record;
  }, []);

  // Initialize the transcription coordinator (main thread; owns the decoder pool)
  useEffect(() => {
    const worker = createTranscriber();

    worker.onmessage = (msg: WorkerOutMessage) => {

      if (msg.type === 'MODEL_LOADING') {
        setFiles(prev => prev.map(f =>
          f.id === msg.id
            ? { ...f, progressLabel: `Loading model… ${Math.round(msg.progress)}%`, progress: msg.progress / 100 }
            : f,
        ));
        return;
      }

      if (msg.type === 'PREPARING') {
        setFiles(prev => prev.map(f =>
          f.id === msg.id ? { ...f, progressLabel: msg.label, progress: 0 } : f,
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
        workerCountRef.current = msg.workers;
        setFiles(prev => prev.map(f =>
          f.id === msg.id
            ? {
                ...f,
                status: 'transcribing',
                progress: msg.total ? msg.completed / msg.total : 0,
                progressLabel: transcribingLabel(msg.completed, msg.total, msg.workers),
              }
            : f,
        ));
        return;
      }

      if (msg.type === 'PROGRESS') {
        const record = msg.segments ? publishSegments(msg.id, msg.segments) : undefined;
        setFiles(prev => prev.map(f => f.id === msg.id ? {
          ...f,
          status: 'transcribing',
          progress: msg.total ? msg.completed / msg.total : 0,
          progressLabel: transcribingLabel(msg.completed, msg.total, workerCountRef.current),
          ...(record ? { transcript: record } : {}),
        } : f));
        return;
      }

      if (msg.type === 'DONE') {
        processingRef.current = null;
        const record = publishSegments(msg.id, msg.segments);
        recordMetaRef.current.delete(msg.id);
        setFiles(prev => prev.map(f =>
          f.id === msg.id ? { ...f, status: 'done', progress: 1, progressLabel: undefined, transcript: record } : f,
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
  }, [publishSegments]);

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
      maxWorkers: decoderPoolSize(settings.model),
    } as WorkerInMessage);
  }, [files, settings]);

  const addFiles = useCallback((newFiles: PickedFile[]) => {
    const items: QueuedFile[] = newFiles.map(({ file, handle }) => ({
      id: crypto.randomUUID(),
      file,
      handle,
      status: 'pending',
      progress: 0,
    }));
    setFiles(prev => [...prev, ...items]);
  }, []);

  const removeFile = useCallback((id: string) => {
    if (id === activeFileId && !confirmDiscard()) return;
    recordMetaRef.current.delete(id);
    workerRef.current?.postMessage({ type: 'DISCARD', id } as WorkerInMessage);
    setFiles(prev => prev.filter(f => f.id !== id));
    setActiveFileId(prev => (prev === id ? null : prev));
  }, [activeFileId, confirmDiscard]);

  // Re-queue a failed file; the worker resumes from the windows it already has
  const retryFile = useCallback((id: string) => {
    setFiles(prev => prev.map(f =>
      f.id === id ? { ...f, status: 'pending', error: undefined, progress: 0, progressLabel: undefined } : f,
    ));
  }, []);

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
  const recording = useRecording(activeTranscript?.id, activeFile?.file);

  return (
    <div className="app">
      <header className="header">
        <a className="back-link" href="/">
          <ArrowLeft size={16} />
          Back to Toolbox
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
              {computeMode === 'webgpu' ? <Zap size={12} /> : <Cpu size={12} />}
              {computeMode === 'webgpu' ? 'GPU' : 'CPU'}
            </span>
          )}
          <button className="btn-icon" title="Settings" onClick={() => setShowSettings(true)}>
            <Settings size={18} />
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
                onRetry={retryFile}
              />
            )}
            <TranscriptViewer
              transcript={activeTranscript}
              editable={activeTranscriptEditable}
              onUpdateTranscript={handleUpdateTranscript}
              onDirtyChange={setHasUnsavedEdits}
              recording={recording.state}
              recordingError={recording.lockedError}
              onUnlockRecording={recording.unlock}
              onAttachRecording={recording.attach}
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
