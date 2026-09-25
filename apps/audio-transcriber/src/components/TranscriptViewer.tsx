import { useState, useCallback, useEffect, useReducer, useRef } from 'react';
import { Check, ChevronDown, FileText, MicOff, Redo2, Undo2 } from 'lucide-react';
import type { TranscriptRecord, Speaker, PickedFile } from '../types';
import type { RecordingState } from '../lib/useRecording';
import { segmentsToText, segmentsToSrt, segmentsToVtt } from '../lib/formatters';
import {
  addSpeaker,
  assignSpeaker,
  editSegmentText,
  mergeWithNext,
  removeSpeaker,
  renameSpeaker,
  setSegmentStart,
  splitSegmentAt,
} from '../lib/transcript';
import SegmentRow from './SegmentRow';
import SpeakerRoster from './SpeakerRoster';
import RecordingPlayer from './RecordingPlayer';

interface Props {
  transcript?: TranscriptRecord;
  editable: boolean;
  onUpdateTranscript: (updated: TranscriptRecord) => void;
  onDirtyChange: (dirty: boolean) => void;
  recording: RecordingState | undefined;
  recordingError?: string;
  onUnlockRecording: () => void;
  onAttachRecording: (picked: PickedFile) => void;
}

interface DraftState {
  draft: TranscriptRecord | undefined;
  undoStack: TranscriptRecord[];
  redoStack: TranscriptRecord[];
}

type ExportFormat = 'txt' | 'srt' | 'vtt';

const EXPORTERS: Record<ExportFormat, { label: string; toString: (segs: TranscriptRecord['segments'], speakers: Speaker[]) => string; mime: string }> = {
  txt: { label: 'Plain text (.txt)', toString: segmentsToText, mime: 'text/plain' },
  srt: { label: 'SubRip (.srt)', toString: segmentsToSrt, mime: 'application/x-subrip' },
  vtt: { label: 'WebVTT (.vtt)', toString: segmentsToVtt, mime: 'text/vtt' },
};

type DraftAction =
  | { type: 'RESYNC'; transcript: TranscriptRecord | undefined }
  | { type: 'RESET'; transcript: TranscriptRecord | undefined }
  | { type: 'COMMIT'; mutate: (r: TranscriptRecord) => TranscriptRecord }
  | { type: 'UNDO' }
  | { type: 'REDO' };

function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'RESYNC':
      return state.undoStack.length > 0
        ? state
        : { draft: action.transcript, undoStack: [], redoStack: [] };
    case 'RESET':
      return { draft: action.transcript, undoStack: [], redoStack: [] };
    case 'COMMIT': {
      if (!state.draft) return state;
      const next = action.mutate(state.draft);
      if (next === state.draft) return state;
      return { draft: next, undoStack: [...state.undoStack, state.draft], redoStack: [] };
    }
    case 'UNDO': {
      if (state.undoStack.length === 0 || !state.draft) return state;
      const prev = state.undoStack[state.undoStack.length - 1];
      return {
        draft: prev,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, state.draft],
      };
    }
    case 'REDO': {
      if (state.redoStack.length === 0 || !state.draft) return state;
      const next = state.redoStack[state.redoStack.length - 1];
      return {
        draft: next,
        undoStack: [...state.undoStack, state.draft],
        redoStack: state.redoStack.slice(0, -1),
      };
    }
  }
}

export default function TranscriptViewer({
  transcript,
  editable,
  onUpdateTranscript,
  onDirtyChange,
  recording,
  recordingError,
  onUnlockRecording,
  onAttachRecording,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const saveMenuRef = useRef<HTMLDivElement>(null);
  const [state, dispatch] = useReducer(
    draftReducer,
    transcript,
    t => ({ draft: t, undoStack: [], redoStack: [] }),
  );
  const dirty = state.undoStack.length > 0;
  const draft = state.draft;

  const lastSyncedIdRef = useRef(transcript?.id);
  useEffect(() => {
    const idChanged = transcript?.id !== lastSyncedIdRef.current;
    lastSyncedIdRef.current = transcript?.id;
    dispatch(idChanged ? { type: 'RESET', transcript } : { type: 'RESYNC', transcript });
  }, [transcript]);

  // Reset transient view state whenever the active transcript changes (or edits
  // become unavailable, e.g. the file resumed transcribing) so switching between
  // files/history items never leaves a stale transcript stuck in edit mode.
  useEffect(() => {
    setEditMode(false);
    setCopied(false);
    setSaveMenuOpen(false);
  }, [transcript?.id, editable]);

  useEffect(() => {
    if (!saveMenuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (saveMenuRef.current && !saveMenuRef.current.contains(e.target as Node)) {
        setSaveMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [saveMenuOpen]);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo — bail out while a textarea is
  // focused so native per-keystroke text undo isn't fought/overridden.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (document.activeElement instanceof HTMLTextAreaElement) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'UNDO' });
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const handleCopy = useCallback(async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(segmentsToText(draft.segments, draft.speakers ?? []));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [draft]);

  const handleSave = useCallback((format: ExportFormat) => {
    if (!draft) return;
    const { toString, mime } = EXPORTERS[format];
    const text = toString(draft.segments, draft.speakers ?? []);
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = draft.filename.replace(/\.[^.]+$/, '') + '_transcript.' + format;
    a.click();
    URL.revokeObjectURL(url);
    setSaveMenuOpen(false);
  }, [draft]);

  const canPlay = recording?.kind === 'ready';

  // The segment under the playhead: the last one starting at or before it. Only
  // highlighted once playback has actually moved, so a freshly loaded file
  // doesn't light up the first row.
  const activeSegmentIndex = (() => {
    if (!canPlay || !draft || (!playing && playbackTime === 0)) return -1;
    let idx = -1;
    draft.segments.forEach((seg, i) => { if (seg.start <= playbackTime + 0.05) idx = i; });
    return idx;
  })();

  const handlePlaySegment = (index: number) => {
    const audio = audioRef.current;
    const seg = draft?.segments[index];
    if (!audio || !seg) return;
    if (index === activeSegmentIndex && playing) {
      audio.pause();
      return;
    }
    audio.currentTime = seg.start;
    audio.play().catch(console.error);
  };

  const handleSplit = (index: number, cursorPos: number) => {
    dispatch({ type: 'COMMIT', mutate: r => ({ ...r, segments: splitSegmentAt(r.segments, index, cursorPos) }) });
  };

  const handleMergeNext = (index: number) => {
    dispatch({ type: 'COMMIT', mutate: r => ({ ...r, segments: mergeWithNext(r.segments, index) }) });
  };

  const handleTextChange = (index: number, text: string) => {
    dispatch({
      type: 'COMMIT',
      mutate: r => {
        const segments = editSegmentText(r.segments, index, text);
        return segments === r.segments ? r : { ...r, segments };
      },
    });
  };

  const handleStartChange = (index: number, start: number) => {
    dispatch({
      type: 'COMMIT',
      mutate: r => {
        const segments = setSegmentStart(r.segments, index, start);
        return segments === r.segments ? r : { ...r, segments };
      },
    });
  };

  const handleAssignSpeaker = (index: number, speakerId: string | undefined) => {
    dispatch({ type: 'COMMIT', mutate: r => ({ ...r, segments: assignSpeaker(r.segments, index, speakerId) }) });
  };

  const handleAddSpeaker = () => {
    dispatch({ type: 'COMMIT', mutate: r => addSpeaker(r) });
  };

  const handleRenameSpeaker = (id: string, name: string) => {
    dispatch({ type: 'COMMIT', mutate: r => renameSpeaker(r, id, name) });
  };

  const handleRemoveSpeaker = (id: string) => {
    dispatch({ type: 'COMMIT', mutate: r => removeSpeaker(r, id) });
  };

  const handleSaveChanges = () => {
    if (!draft) return;
    onUpdateTranscript(draft);
    dispatch({ type: 'RESET', transcript: draft });
  };

  const handleDiscardChanges = () => {
    dispatch({ type: 'RESET', transcript });
  };

  return (
    <div className="transcript-panel">
      <div className="transcript-header">
        <span className="transcript-title">
          {transcript ? transcript.filename : 'Transcript'}
        </span>
        {draft && (
          <div className="transcript-actions">
            {(state.undoStack.length > 0 || state.redoStack.length > 0) && (
              <>
                <button
                  className="btn-icon"
                  disabled={state.undoStack.length === 0}
                  onClick={() => dispatch({ type: 'UNDO' })}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 size={17} />
                </button>
                <button
                  className="btn-icon"
                  disabled={state.redoStack.length === 0}
                  onClick={() => dispatch({ type: 'REDO' })}
                  title="Redo (Ctrl+Shift+Z)"
                >
                  <Redo2 size={17} />
                </button>
              </>
            )}
            {dirty && (
              <>
                <button className="btn-ghost" onClick={handleDiscardChanges}>
                  Discard changes
                </button>
                <button className="btn-primary" onClick={handleSaveChanges}>
                  Save changes
                </button>
              </>
            )}
            <button
              className={editMode ? 'btn-secondary btn-active' : 'btn-secondary'}
              disabled={!editable}
              title={editable ? undefined : 'Editing is available once transcription finishes'}
              onClick={() => setEditMode(v => !v)}
            >
              {editMode ? 'Done editing' : 'Edit'}
            </button>
            <button className="btn-ghost btn-with-icon" onClick={handleCopy}>
              {copied ? <><Check size={14} /> Copied</> : 'Copy all'}
            </button>
            <div className="save-dropdown" ref={saveMenuRef}>
              <button className="btn-secondary btn-with-icon" onClick={() => setSaveMenuOpen(v => !v)}>
                Save <ChevronDown size={14} />
              </button>
              {saveMenuOpen && (
                <div className="save-dropdown-menu">
                  {(Object.keys(EXPORTERS) as ExportFormat[]).map(format => (
                    <button key={format} className="save-dropdown-item" onClick={() => handleSave(format)}>
                      {EXPORTERS[format].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {draft && (
        <RecordingPlayer
          recording={recording}
          error={recordingError}
          audioRef={audioRef}
          onUnlock={onUnlockRecording}
          onAttach={onAttachRecording}
          onTimeUpdate={setPlaybackTime}
          onPlayingChange={setPlaying}
        />
      )}

      {draft && editMode && (
        <SpeakerRoster
          speakers={draft.speakers ?? []}
          onAdd={handleAddSpeaker}
          onRename={handleRenameSpeaker}
          onRemove={handleRemoveSpeaker}
        />
      )}

      <div className="transcript-body">
        {!draft ? (
          <div className="transcript-empty">
            <FileText size={40} strokeWidth={1.5} className="empty-icon" />
            <span>Select a completed file to view its transcript</span>
          </div>
        ) : draft.segments.length === 0 ? (
          <div className="transcript-empty">
            <MicOff size={40} strokeWidth={1.5} className="empty-icon" />
            <span>No speech detected in this file</span>
          </div>
        ) : (
          draft.segments.map((seg, i) => (
            <SegmentRow
              key={seg.id}
              segment={seg}
              speakers={draft.speakers ?? []}
              editMode={editMode}
              canMergeNext={i < draft.segments.length - 1}
              isCurrent={i === activeSegmentIndex}
              isPlaying={i === activeSegmentIndex && playing}
              onPlay={canPlay ? () => handlePlaySegment(i) : undefined}
              onSplit={cursorPos => handleSplit(i, cursorPos)}
              onMergeNext={() => handleMergeNext(i)}
              onAssignSpeaker={speakerId => handleAssignSpeaker(i, speakerId)}
              onTextChange={text => handleTextChange(i, text)}
              onStartChange={start => handleStartChange(i, start)}
            />
          ))
        )}
      </div>
    </div>
  );
}
