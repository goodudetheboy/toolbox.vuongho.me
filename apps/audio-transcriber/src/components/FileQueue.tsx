import { useEffect, useRef, useState } from 'react';
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

// How often the ETA is recalculated. Windows finish in bursts, so a
// per-second estimate bounces around; in between it just counts down.
const ETA_REFRESH_MS = 10_000;
// Don't estimate from the first window or two to finish: the first batch
// (one window per worker) lands together ~10–15s in, and an estimate taken
// before that is wildly off (e.g. "~7m left" for a 45s job).
const ETA_MIN_SAMPLE_MS = 20_000;

interface EtaSnapshot {
  // Identifies the run, so a retry doesn't reuse the last run's estimate
  runStartedAt: number;
  remainingMs: number;
  computedAt: number;
}

// Projects this run's transcription pace over the remaining progress. Model
// loading and audio extraction happen before that phase and aren't counted.
function estimateRemaining(f: QueuedFile, now: number): number | null {
  if (!f.transcribeStartedAt) return null;
  const done = f.progress - (f.transcribeStartProgress ?? 0);
  const spent = now - f.transcribeStartedAt;
  if (done <= 0 || spent < ETA_MIN_SAMPLE_MS) return null;
  return ((1 - f.progress) / done) * spent;
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

  const etaRef = useRef(new Map<string, EtaSnapshot>());

  // "1m 05s elapsed · ~2m 10s left" while running, "Took 3m 15s" when done.
  const timingLabel = (f: QueuedFile): string | null => {
    if (!f.startedAt) return null;
    if (f.finishedAt) {
      etaRef.current.delete(f.id);
      const took = formatDuration(f.finishedAt - f.startedAt);
      return f.status === 'error' ? `Stopped after ${took}` : `Took ${took}`;
    }
    if (!isRunning(f)) return null;

    const elapsed = `${formatDuration(now - f.startedAt)} elapsed`;
    if (f.status !== 'transcribing') return elapsed;

    let snap = etaRef.current.get(f.id);
    if (!snap || snap.runStartedAt !== f.startedAt || now - snap.computedAt >= ETA_REFRESH_MS) {
      const remainingMs = estimateRemaining(f, now);
      if (remainingMs === null) {
        etaRef.current.delete(f.id);
        return `${elapsed} · estimating…`;
      }
      snap = { runStartedAt: f.startedAt, remainingMs, computedAt: now };
      etaRef.current.set(f.id, snap);
    }
    const left = snap.remainingMs - (now - snap.computedAt);
    return left > 1000
      ? `${elapsed} · ~${formatDuration(left)} left`
      : `${elapsed} · almost done`;
  };

  return (
    <div className="queue-panel">
      <div className="queue-header">{files.length} file{files.length !== 1 ? 's' : ''}</div>
      <div className="queue-list">
        {files.map(f => {
          const timing = timingLabel(f);
          return (
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
              {timing && <div className="queue-item-time">{timing}</div>}
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
          );
        })}
      </div>
    </div>
  );
}
