import { useEffect, useState } from 'react';
import { AudioLines, FolderOpen, Unlock } from 'lucide-react';
import type { PickedFile } from '../types';
import type { RecordingState } from '../lib/useRecording';
import { pickMediaFiles } from '../lib/filePicker';

interface Props {
  recording: RecordingState | undefined;
  error?: string;
  audioRef: React.RefObject<HTMLAudioElement>;
  onUnlock: () => void;
  onAttach: (picked: PickedFile) => void;
  onTimeUpdate: (time: number) => void;
  onPlayingChange: (playing: boolean) => void;
}

export default function RecordingPlayer({
  recording,
  error,
  audioRef,
  onUnlock,
  onAttach,
  onTimeUpdate,
  onPlayingChange,
}: Props) {
  const file = recording?.kind === 'ready' ? recording.file : undefined;
  const [src, setSrc] = useState<string>();
  const [unplayable, setUnplayable] = useState(false);

  useEffect(() => {
    setUnplayable(false);
    onTimeUpdate(0);
    onPlayingChange(false);
    if (!file) { setSrc(undefined); return; }
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file, onTimeUpdate, onPlayingChange]);

  const attach = () => {
    pickMediaFiles(false).then(([picked]) => { if (picked) onAttach(picked); }).catch(console.error);
  };

  if (!recording || recording.kind === 'checking') return null;

  if (recording.kind === 'ready') {
    return (
      <div className="recording-bar">
        <audio
          ref={audioRef}
          className="recording-audio"
          src={src}
          controls
          preload="metadata"
          onTimeUpdate={e => onTimeUpdate(e.currentTarget.currentTime)}
          onSeeked={e => onTimeUpdate(e.currentTarget.currentTime)}
          onPlay={() => onPlayingChange(true)}
          onPause={() => onPlayingChange(false)}
          onEnded={() => onPlayingChange(false)}
          onError={() => setUnplayable(true)}
        />
        {unplayable && (
          <div className="recording-note recording-note-error">
            Your browser can't play this file's format, so playback isn't available for it.
          </div>
        )}
      </div>
    );
  }

  const note = recording.kind === 'missing' ? recording.error : error;

  return (
    <div className="recording-bar recording-bar-empty">
      <AudioLines size={18} className="recording-bar-icon" />
      <div className="recording-note">
        {recording.kind === 'locked' ? (
          <>Reopen <strong>{recording.filename}</strong> to play the recording.</>
        ) : (
          <>Recording not loaded. Attach the original file to play it back.</>
        )}
        {note && <div className="recording-note-error">{note}</div>}
      </div>
      {recording.kind === 'locked' && (
        <button className="btn-secondary btn-with-icon" onClick={onUnlock}>
          <Unlock size={14} /> Reopen
        </button>
      )}
      <button className={`${recording.kind === 'locked' ? 'btn-ghost' : 'btn-secondary'} btn-with-icon`} onClick={attach}>
        <FolderOpen size={14} /> {recording.kind === 'locked' ? 'Choose file…' : 'Attach file…'}
      </button>
    </div>
  );
}
