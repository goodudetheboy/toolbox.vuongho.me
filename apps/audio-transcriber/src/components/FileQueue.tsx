import { useEffect, useState } from 'react';
import { Film, Music, RotateCw, X } from 'lucide-react';
import type { QueuedFile, FileStatus } from '../types';
import { formatDuration } from '../lib/formatters';

interface Props {
  files: QueuedFile[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mov', 'mkv', 'webm', 'avi'].includes(ext)) return <Film size={18} />;
  return <Music size={18} />;
}

function statusDot(status: FileStatus): string {
  if (status === 'done') return 'done';
  if (status === 'error') return 'error';
  if (status === 'pending') return 'pending';
  return 'working';
}

function statusLabel(file: QueuedFile): string {
  if (file.status === 'done') return 'Done';
  if (file.status === 'error') return file.error ?? 'Error';
  if (file.status === 'pending') return 'Waiting…';
  return file.progressLabel ?? 'Processing…';
}

const isRunning = (f: QueuedFile) => f.status === 'extracting' || f.status === 'transcribing';

// "1m 05s elapsed · ~2m 10s left" while running, "Took 3m 15s" when done.
// ETA extrapolates this run's transcription pace over the remaining progress;
// model loading and audio extraction happen before that phase and aren't counted.
function timingLabel(f: QueuedFile, now: number): string | null {
  if (!f.startedAt) return null;
  if (f.finishedAt) {
    const took = formatDuration(f.finishedAt - f.startedAt);
    return f.status === 'error' ? `Stopped after ${took}` : `Took ${took}`;
  }
  if (!isRunning(f)) return null;

  const elapsed = `${formatDuration(now - f.startedAt)} elapsed`;
  if (f.status !== 'transcribing' || !f.transcribeStartedAt) return elapsed;

  const done = f.progress - (f.transcribeStartProgress ?? 0);
  const spent = now - f.transcribeStartedAt;
  if (done <= 0 || spent <= 0) return `${elapsed} · estimating…`;
  const remaining = ((1 - f.progress) / done) * spent;
  return `${elapsed} · ~${formatDuration(remaining)} left`;
}

export default function FileQueue({ files, activeId, onSelect, onRemove, onRetry }: Props) {
  // Tick once a second while something is running so the timer moves
  const anyRunning = files.some(isRunning);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!anyRunning) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [anyRunning]);

  return (
    <div className="queue-panel">
      <div className="queue-header">{files.length} file{files.length !== 1 ? 's' : ''}</div>
      <div className="queue-list">
        {files.map(f => (
          <div
            key={f.id}
            className={`queue-item ${f.id === activeId ? 'active' : ''}`}
            onClick={() => (f.status === 'done' || f.transcript) && onSelect(f.id)}
          >
            <span className="queue-item-icon">{fileIcon(f.file.name)}</span>
            <div className="queue-item-info">
              <div className="queue-item-name" title={f.file.name}>{f.file.name}</div>
              <div className="queue-item-status" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span className={`status-dot ${statusDot(f.status)}`} />
                <span>{statusLabel(f)}</span>
              </div>
              {timingLabel(f, now) && <div className="queue-item-time">{timingLabel(f, now)}</div>}
              {(f.status === 'extracting' || f.status === 'transcribing') && (
                <div className="progress-bar">
                  <div
                    className={`progress-bar-fill ${f.progress === 0 ? 'indeterminate' : ''}`}
                    style={{ width: `${Math.round(f.progress * 100)}%` }}
                  />
                </div>
              )}
            </div>
            {f.status === 'error' && (
              <button
                className="queue-item-retry"
                title="Retry (picks up where it failed)"
                onClick={e => { e.stopPropagation(); onRetry(f.id); }}
              >
                <RotateCw size={14} />
              </button>
            )}
            <button
              className="queue-item-remove"
              title="Remove"
              onClick={e => { e.stopPropagation(); onRemove(f.id); }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
